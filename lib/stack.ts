import { Duration, Stack, StackProps, Tags } from 'aws-cdk-lib';
import {
  Dashboard,
  LogQueryVisualizationType,
  LogQueryWidget,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import {
  Architecture,
  Code,
  DockerImageCode,
  DockerImageFunction,
  Function,
  FunctionProps,
  LayerVersion,
  LoggingFormat,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import path = require('node:path');

const commonLambdaProps: Partial<FunctionProps> = {
  architecture: Architecture.ARM_64,
  memorySize: 128,
};

export class BenchmarkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const nodeQueue = new Queue(this, 'node-queue', {
      visibilityTimeout: Duration.minutes(30),
    });
    const bunQueue = new Queue(this, 'bun-queue', {
      visibilityTimeout: Duration.minutes(30),
    });
    const denoQueue = new Queue(this, 'deno-queue', {
      visibilityTimeout: Duration.minutes(30),
    });

    const nodeFunction = new NodejsFunction(this, 'NodeFunction', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '..', 'src', 'node-handler.js'),
      runtime: Runtime.NODEJS_22_X,
      logRetention: RetentionDays.ONE_MONTH,
      loggingFormat: LoggingFormat.JSON,
    });
    nodeFunction.addEventSource(
      new SqsEventSource(nodeQueue, {
        batchSize: 1,
      }),
    );
    Tags.of(nodeFunction).add('BenchmarkFunction', 'true');

    const denoFunction = new DockerImageFunction(this, 'DenoFunction', {
      ...commonLambdaProps,
      code: DockerImageCode.fromImageAsset(path.join(__dirname, '..', 'src'), {
        file: 'Dockerfile.deno',
        exclude: ['bun-handler.ts', 'node-handler.js'],
      }),
      logRetention: RetentionDays.ONE_MONTH,
      loggingFormat: LoggingFormat.JSON,
    });
    denoFunction.addEventSource(
      new SqsEventSource(denoQueue, {
        batchSize: 1,
      }),
    );
    Tags.of(denoFunction).add('BenchmarkFunction', 'true');

    const bunLayer = new LayerVersion(this, 'bun-layer', {
      code: Code.fromAsset(
        path.join(
          __dirname,
          '..',
          'tmp',
          'bun',
          'packages',
          'bun-lambda',
          'bun-lambda-layer.zip',
        ),
      ),
      layerVersionName: 'bun-arm64',
      compatibleArchitectures: [Architecture.ARM_64],
      compatibleRuntimes: [Runtime.PROVIDED_AL2, Runtime.PROVIDED_AL2023],
      description:
        'Bun is an incredibly fast JavaScript runtime, bundler, transpiler, and package manager.',
      license: 'MIT',
    });

    const bunFunction = new Function(this, 'BunFunction', {
      ...commonLambdaProps,
      code: Code.fromAsset(path.join(__dirname, '..', 'src'), {
        exclude: ['deno-handler.ts', 'Dockerfile.deno', 'node-handler.js'],
      }),
      runtime: Runtime.PROVIDED_AL2023,
      handler: 'bun-handler.fetch',
      layers: [bunLayer],
      logRetention: RetentionDays.ONE_MONTH,
      loggingFormat: LoggingFormat.JSON,
    });
    bunFunction.addEventSource(
      new SqsEventSource(bunQueue, {
        batchSize: 1,
      }),
    );
    Tags.of(bunFunction).add('BenchmarkFunction', 'true');

    const benchmarkFunction = new NodejsFunction(this, 'BenchmarkFunction', {
      entry: path.join(__dirname, '..', 'src', 'test-handler.ts'),
      runtime: Runtime.NODEJS_22_X,
      logRetention: RetentionDays.ONE_MONTH,
      loggingFormat: LoggingFormat.JSON,
      timeout: Duration.minutes(15),
      environment: {
        ARN_NODE_FUNCTION: nodeFunction.functionArn,
        ARN_NODE_QUEUE: nodeQueue.queueArn,
        ARN_DENO_FUNCTION: denoFunction.functionArn,
        ARN_DENO_QUEUE: denoQueue.queueArn,
        ARN_BUN_FUNCTION: bunFunction.functionArn,
        ARN_BUN_QUEUE: bunQueue.queueArn,
      },
    });
    nodeQueue.grantSendMessages(benchmarkFunction);
    denoQueue.grantSendMessages(benchmarkFunction);
    bunQueue.grantSendMessages(benchmarkFunction);
    nodeFunction.grantInvoke(benchmarkFunction);
    denoFunction.grantInvoke(benchmarkFunction);
    bunFunction.grantInvoke(benchmarkFunction);

    const rule = new Rule(this, 'benchmark-rule', {
      ruleName: 'LambdaBenchmark',
      schedule: Schedule.rate(Duration.hours(3)),
      targets: [
        new LambdaFunction(benchmarkFunction, {
          event: RuleTargetInput.fromObject({
            'detail-type': 'lambda-benchmark',
            detail: { lambda: 'NODE' },
          }),
        }),
        new LambdaFunction(benchmarkFunction, {
          event: RuleTargetInput.fromObject({
            'detail-type': 'lambda-benchmark',
            detail: { lambda: 'BUN' },
          }),
        }),
        new LambdaFunction(benchmarkFunction, {
          event: RuleTargetInput.fromObject({
            'detail-type': 'lambda-benchmark',
            detail: { lambda: 'DENO' },
          }),
        }),
      ],
    });

    const dashboard = new Dashboard(this, 'benchmark-dashboard', {
      dashboardName: 'Lambda_Runtime_Benchmark',
    });

    dashboard.addWidgets(
      new LogQueryWidget({
        title: 'Benchmark Stats',
        logGroupNames: [
          nodeFunction.logGroup.logGroupName,
          denoFunction.logGroup.logGroupName,
          bunFunction.logGroup.logGroupName,
        ],
        view: LogQueryVisualizationType.TABLE,
        width: 24,
        height: 4,
        queryLines: [
          `fields record.metrics.durationMs AS durationMs, record.metrics.initDurationMs AS initDurationMs, @entity.KeyAttributes.Name AS functionName`,
          `filter type = "platform.report"`,
          `stats count() as invocations, count(initDurationMs) as coldStarts,
                 avg(durationMs) as avgDuration, pct(durationMs, 10) as p10Duration, pct(durationMs, 25) as p25Duration, pct(durationMs, 50) as p50Duration, pct(durationMs, 75) as p75Duration, pct(durationMs, 90) as p90Duration,
                 avg(initDurationMs) as avgInitDuration, pct(initDurationMs, 10) as p10InitDuration, pct(initDurationMs, 25) as p25InitDuration, pct(initDurationMs, 50) as p50InitDuration, pct(initDurationMs, 75) as p75InitDuration, pct(initDurationMs, 90) as p90InitDuration
            by functionName`,
        ],
      }),
    );
    dashboard.addWidgets(
      new LogQueryWidget({
        title: 'Benchmark Stats - Invocation Duration',
        logGroupNames: [
          nodeFunction.logGroup.logGroupName,
          denoFunction.logGroup.logGroupName,
          bunFunction.logGroup.logGroupName,
        ],
        view: LogQueryVisualizationType.TABLE,
        width: 24,
        height: 4,
        queryLines: [
          `fields record.metrics.durationMs AS durationMs, @entity.KeyAttributes.Name AS functionName`,
          `filter type = "platform.report"`,
          `stats count() as invocations,
                 avg(durationMs) as avgDuration, pct(durationMs, 10) as p10Duration, pct(durationMs, 25) as p25Duration, pct(durationMs, 50) as p50Duration, pct(durationMs, 75) as p75Duration, pct(durationMs, 90) as p90Duration
            by functionName`,
        ],
      }),
    );
    dashboard.addWidgets(
      new LogQueryWidget({
        title: 'Benchmark Stats - Initialization Duration',
        logGroupNames: [
          nodeFunction.logGroup.logGroupName,
          denoFunction.logGroup.logGroupName,
          bunFunction.logGroup.logGroupName,
        ],
        view: LogQueryVisualizationType.TABLE,
        width: 24,
        height: 4,
        queryLines: [
          `fields record.metrics.initDurationMs AS initDurationMs, @entity.KeyAttributes.Name AS functionName`,
          `filter type = "platform.report"`,
          `stats count() as invocations, count(initDurationMs) as coldStarts,
                 avg(initDurationMs) as avgInitDuration, pct(initDurationMs, 10) as p10InitDuration, pct(initDurationMs, 25) as p25InitDuration, pct(initDurationMs, 50) as p50InitDuration, pct(initDurationMs, 75) as p75InitDuration, pct(initDurationMs, 90) as p90InitDuration
            by functionName`,
        ],
      }),
    );
  }
}
