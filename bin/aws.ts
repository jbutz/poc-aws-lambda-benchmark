#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BenchmarkStack } from '../lib/stack';

const app = new cdk.App();
new BenchmarkStack(app, 'LambdaBenchmarkStack', {
  env: { region: 'us-east-2' },
});
