import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import path from 'path';

export class BucketSweeperCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Role for S3 Batch Operations
    const s3BatchRole = new iam.Role(this, 'BucketSweeperS3BatchOperationsRole', {
      assumedBy: new iam.ServicePrincipal('batchoperations.s3.amazonaws.com'),
      description: 'Role for S3 Batch Operations to perform a bucket sweep'
    });

    s3BatchRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObjectTagging'
      ],
      resources: [
        'arn:aws:s3:::*'
      ]
    }));

    // Role for Lambda function
    const lambdaRole = new iam.Role(this, 'BucketSweeperLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    });

    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Allow Lambda function to interact with any S3 bucket
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:CreateJob',
        's3:ListBucket',
        'deadline:GetJob',
        'deadline:SearchJobs'
      ],
      resources: ['*']
    }));

    // Allow the Lambda function pass the S3 Batch role to the batch operations job
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [s3BatchRole.roleArn]
    }));

    const bucketSweeperFunction = new PythonFunction(this, 'BucketSweeperFunction', {
      architecture: lambda.Architecture.X86_64,  // ARM64 not available
      runtime: lambda.Runtime.PYTHON_3_12,
      entry: path.join(__dirname, '../lambda'),
      index: 'bucket_sweeper_function.py',
      handler: 'handler',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      ephemeralStorageSize: cdk.Size.gibibytes(10),
      environment: {
        PYTHONPATH: '/var/task',
        S3_BATCH_ROLE_ARN: s3BatchRole.roleArn
      }
    });

    // Create EventBridge rule to schedule the Lambda function
    // Change the rate to your desired frequency (e.g., rate(7 days) for weekly)
    const scheduleRule = new events.Rule(this, 'BucketSweeperScheduleRule', {
      schedule: events.Schedule.rate(cdk.Duration.days(7)), // Run every 7 days
      description: 'Schedule for bucket sweeper Lambda function'
    });

    // Add the Lambda function as a target for the EventBridge rule with event variables
    scheduleRule.addTarget(new targets.LambdaFunction(bucketSweeperFunction, {
      event: events.RuleTargetInput.fromObject({
        bucket_name: 'my-bucket',
        root_prefix: 'DeadlineCloud',
        retention_days: '120',
      })
    }));
  }
}
