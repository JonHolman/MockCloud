import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { buckets as s3Buckets, createBucket, deleteBucket } from '../../../s3/index.js';
import { ServiceError } from '../../../response.js';
import { parseTags } from './tags.js';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const s3BucketProvider: ResourceProvider = {
  type: 'AWS::S3::Bucket',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const bucketName = (properties.BucketName as string)
      ?? `${context.stackName}-${logicalId}-${randomSuffix()}`.toLowerCase();

    createBucket(bucketName, context.region, parseTags(properties.Tags));
    const arn = `arn:aws:s3:::${bucketName}`;
    return {
      physicalId: bucketName,
      attributes: {
        Arn: arn,
        DomainName: `${bucketName}.s3.amazonaws.com`,
        RegionalDomainName: `${bucketName}.s3.${context.region}.amazonaws.com`,
        WebsiteURL: `http://${bucketName}.s3-website-${context.region}.amazonaws.com`,
      },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const bucket = s3Buckets.get(physicalId);
    if (bucket) {
      bucket.Tags = parseTags(properties.Tags);
      s3Buckets.set(physicalId, bucket);
    }
    const arn = `arn:aws:s3:::${physicalId}`;
    return {
      physicalId,
      attributes: {
        Arn: arn,
        DomainName: `${physicalId}.s3.amazonaws.com`,
        RegionalDomainName: `${physicalId}.s3.${context.region}.amazonaws.com`,
        WebsiteURL: `http://${physicalId}.s3-website-${context.region}.amazonaws.com`,
      },
    };
  },
  delete(physicalId: string): void {
    try {
      deleteBucket(physicalId);
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    }
  },
};
