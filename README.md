# JavaScript Lambda Runtime Benchmark

This project measures the performance of AWS Lambda functions running on different JavaScript runtimes: Node.js, Bun, and Deno. It uses the AWS CDK to provision the infrastructure, including a CloudWatch dashboard for metrics visualization. The Lambdas are invoked on a schedule by messages being sent to SQS queues.

## Features

- **Node.js, Bun, and Deno Lambda Functions**: Each runtime runs a function that performs SHA3-512 hashing to simulate compute work.
- **CloudWatch Dashboard**: Visualizes cold start times, invocation durations, and other metrics for all runtimes.
- **CDK Infrastructure**: Easily deploys and manages all related AWS resources.

![AWS infrastructure and orchestration pattern diagram](assets/aws-diagram.svg)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/), v22+
- [Bun](https://bun.sh/), necessary for building the Bun Lambda Layer
- [Docker](https://www.docker.com/), [Podman](https://podman.io/), or similar container engine with Docker compatibility

A [Devcontainer](https://containers.dev) configuration is present in this repository and installs the necessary prerequisites for you. If you want to learn more about devcontainers in VS Code, check out [VS Code's documentation](https://code.visualstudio.com/docs/devcontainers/containers).

### Setup

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Deploy the Resources

Running the command will deploy all Lambda functions, SQS queues, and the CloudWatch dashboard. The Lambda functions will automatically be executed on a recurring schedule and may incur costs in your AWS account. Your AWS credentials need to be configured before running the command below. All resources will be deployed to the Ohio (us-east-2) region, you can change this in the `bin/aws.ts` file.

```bash
npm run deploy
```

#### 3. View the Dashboard

After letting the Lambda functions accumulate metrics for a few days, check out the CloudWatch Dashboard. Be sure to delete the CloudFormation stack when you are done with the benchmark.
