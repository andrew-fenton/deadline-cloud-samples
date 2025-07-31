import os
import boto3

from typing import Dict, Any
from deadline.client.cli._groups.click_logger import ClickLogger
from deadline.job_attachments import api as job_attachments_api


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    try:
        # Extract parameters from event
        bucket_name: str = event.get("bucket_name", "")
        root_prefix: str = event.get("root_prefix", "")
        retention_days: str = event.get("retention_days", "")
        dry_run: bool = event.get("dry_run", False)

        # Get role ARN from environment variable
        s3_batch_job_arn_role: str = os.environ["S3_BATCH_ROLE_ARN"]

        logger: ClickLogger = ClickLogger(is_json=False)
        boto3_session: boto3.Session = boto3.Session()

        logger.echo(f"Starting bucket cleanup for {bucket_name}")
        logger.echo(f"Root prefix: {root_prefix}")
        logger.echo(f"Retention days: {retention_days}")
        logger.echo(f"Batch role arn: {s3_batch_job_arn_role}")

        # Call the attachment sweep function. Throws validation errors if
        # required parameters are missing.
        job_attachments_api._attachment_sweep(
            bucket_name=bucket_name,
            root_prefix=root_prefix,
            boto3_session=boto3_session,
            s3_batch_job_arn_role=s3_batch_job_arn_role,
            retention_days=int(retention_days),
            dry_run=bool(dry_run),
            logging_function_callback=logger.echo,
        )

        return {
            "statusCode": 200,
            "body": {
                "message": f"Bucket sweep completed successfully for {bucket_name}/{root_prefix}"
            },
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": {"message": "Bucket sweep failed", "error": str(e)},
        }
