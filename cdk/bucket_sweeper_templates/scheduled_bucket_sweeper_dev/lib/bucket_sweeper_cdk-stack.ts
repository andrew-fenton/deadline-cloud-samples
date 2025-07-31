import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import path from 'path';

export class BucketSweeperCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a role for the S3 Batch Operations job
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

    // Allow Lambda function to interact with any S3 bucket and call Deadline APIs
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

    // Setup Lambda function for development
    const deadlineLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'DeadlineLayer',
      'arn:aws:lambda:us-west-2:822218623582:layer:deadline-layer:7'
    );

    const bucketSweeperFunction = new lambda.Function(this, 'BucketSweeeperFunctionDev', {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      handler: 'bucket_sweeper_function.handler',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      ephemeralStorageSize: cdk.Size.gibibytes(10),
      layers: [deadlineLayer],  // provide dependencies via LambdaLayer
      environment: {
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
        bucket_name: 'afento-bucket-3259666366',
        root_prefix: 'DeadlineCloud',
        retention_days: '120',
      })
    }));
  }
}
