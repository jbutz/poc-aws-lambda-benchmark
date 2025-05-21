import * as cdk from 'aws-cdk-lib';
import { Template, Match, Capture } from 'aws-cdk-lib/assertions';
import { BenchmarkStack } from '../lib/stack';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';

describe('RuntimeStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new BenchmarkStack(app, 'MyTestStack');
    template = Template.fromStack(stack);
  });
  test('Node.js Lambda Created', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: Runtime.NODEJS_22_X.toString(),
      Architectures: Match.arrayEquals([Architecture.ARM_64.toString()]),
    });
  });
  test('Bun Lambda Created', () => {
    new Capture();
    const layerResourceId = template.getResourceId(
      'AWS::Lambda::LayerVersion',
      {
        Properties: {
          LayerName: 'bun-arm64',
          LicenseInfo: 'MIT',
          CompatibleArchitectures: Match.arrayEquals([
            Architecture.ARM_64.toString(),
          ]),
          CompatibleRuntimes: Match.arrayEquals([
            Runtime.PROVIDED_AL2.toString(),
            Runtime.PROVIDED_AL2023.toString(),
          ]),
        },
      },
    );

    const layerCapture = new Capture();
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: [Architecture.ARM_64.toString()],
      Runtime: Runtime.PROVIDED_AL2023.toString(),
      Layers: [{ Ref: layerCapture }],
    });

    expect(layerResourceId).toEqual(layerCapture.asString());
  });
  test('Deno Lambda Created', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: [Architecture.ARM_64.toString()],
      PackageType: 'Image',
    });
  });
  test('Lambdas have a level playing field', () => {
    template.resourcePropertiesCountIs(
      'AWS::Lambda::Function',
      {
        Architectures: [Architecture.ARM_64.toString()],
        MemorySize: 128,
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'BenchmarkFunction', Value: 'true' }),
        ]),
      },
      3,
    );
  });
});
