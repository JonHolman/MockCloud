import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { buckets } from '../../../s3/index.js';

export const s3BucketPolicyProvider: ResourceProvider = {
  type: 'AWS::S3::BucketPolicy',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const bucketName = (properties.Bucket as string) ?? `${context.stackName}-${logicalId}`;
    const bucket = buckets.get(bucketName);
    if (bucket) {
      bucket.Policy = JSON.stringify(properties.PolicyDocument);
      buckets.set(bucketName, bucket);
    }
    return {
      physicalId: bucketName,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const bucket = buckets.get(physicalId);
    if (bucket) {
      bucket.Policy = JSON.stringify(properties.PolicyDocument);
      buckets.set(physicalId, bucket);
    }
    return { physicalId, attributes: {} };
  },
  delete(physicalId: string): void {
    const bucket = buckets.get(physicalId);
    if (bucket) {
      delete bucket.Policy;
      buckets.set(physicalId, bucket);
    }
  },
};

