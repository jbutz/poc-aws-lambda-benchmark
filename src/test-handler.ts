import {
  GetQueueUrlCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type { EventBridgeEvent } from 'aws-lambda';
import process = require('node:process');

const nodeQueueArn: string = process.env.ARN_NODE_QUEUE!;
const denoQueueArn: string = process.env.ARN_DENO_QUEUE!;
const bunQueueArn: string = process.env.ARN_BUN_QUEUE!;
const DELAY_MAX = 900;
const INVOKE_MAX = 30;

let sqsClient: SQSClient;
export async function handler(
  req: EventBridgeEvent<
    'lambda-benchmark',
    { lambda: 'NODE' | 'DENO' | 'BUN' }
  >,
) {
  if (!nodeQueueArn || !denoQueueArn || !bunQueueArn) {
    console.error('Missing queue ARN environment variable.', {
      ARN_NODE_QUEUE: process.env.ARN_NODE_QUEUE,
      ARN_DENO_QUEUE: process.env.ARN_DENO_QUEUE,
      ARN_BUN_QUEUE: process.env.ARN_BUN_QUEUE,
    });
    throw new Error('Missing queue ARN environment variable.');
  }
  console.debug({ message: 'Event Argument', event: req });
  sqsClient = sqsClient || new SQSClient();

  let queueArn: string;
  if (req.detail.lambda === 'NODE') {
    queueArn = nodeQueueArn;
  } else if (req.detail.lambda === 'DENO') {
    queueArn = denoQueueArn;
  } else if (req.detail.lambda === 'BUN') {
    queueArn = bunQueueArn;
  } else {
    throw new Error(`Unknown queue arn for "${req.detail.lambda}".`);
  }

  const resp = await sqsClient.send(
    new GetQueueUrlCommand({
      QueueName: queueArn.split(':').slice(-1)[0],
    }),
  );
  const queueUrl = resp.QueueUrl!;

  for (let i = 0; i < INVOKE_MAX; i++) {
    const resp = await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: '{}',
        DelaySeconds:
          i == 0 ? undefined : Math.min(Math.round(DELAY_MAX / i), DELAY_MAX),
      }),
    );

    console.log({
      message: 'Send Message Complete',
      statusCode: resp.$metadata.httpStatusCode,
      messageId: resp.MessageId,
      sequenceNumber: resp.SequenceNumber,
    });
  }

  return {};
}
