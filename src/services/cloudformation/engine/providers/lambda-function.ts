import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import {
  functions,
  isoNow,
  deleteFunctionState,
  createFunction,
  makeFunctionArn,
} from '../../../lambda/state.js';
import { parseTags } from './tags.js';

export const lambdaFunctionProvider: ResourceProvider = {
  type: 'AWS::Lambda::Function',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const functionName = (properties.FunctionName as string)
      ?? `${context.stackName}-${logicalId}`;

    const env = properties.Environment as { Variables?: Record<string, string> } | undefined;
    const code = properties.Code as { S3Bucket?: string; S3Key?: string } | undefined;

    const fn = createFunction({
      functionName,
      runtime: properties.Runtime as string | undefined,
      role: properties.Role as string | undefined,
      handler: properties.Handler as string | undefined,
      description: properties.Description as string | undefined,
      timeout: properties.Timeout as number | undefined,
      memorySize: properties.MemorySize as number | undefined,
      environment: env?.Variables,
      tags: parseTags(properties.Tags),
      s3Bucket: code?.S3Bucket,
      s3Key: code?.S3Key,
      codeSize: 0,
    });

    return {
      physicalId: functionName,
      attributes: { Arn: fn.functionArn },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const fn = functions.get(physicalId);
    if (!fn) {
      throw new Error(`Lambda function not found: ${physicalId}`);
    }

    const env = properties.Environment as { Variables?: Record<string, string> } | undefined;
    const code = properties.Code as { S3Bucket?: string; S3Key?: string } | undefined;

    fn.handler = (properties.Handler as string) ?? fn.handler;
    fn.runtime = (properties.Runtime as string) ?? fn.runtime;
    fn.role = (properties.Role as string) ?? fn.role;
    fn.timeout = (properties.Timeout as number) ?? fn.timeout;
    fn.memorySize = (properties.MemorySize as number) ?? fn.memorySize;
    fn.description = (properties.Description as string) ?? fn.description;
    if (env) fn.environment = { Variables: env.Variables ?? {} };
    if (code?.S3Bucket !== undefined) fn.s3Bucket = code.S3Bucket;
    if (code?.S3Key !== undefined) fn.s3Key = code.S3Key;
    if (properties.Tags !== undefined) fn.tags = parseTags(properties.Tags);
    fn.lastModified = isoNow();
    fn.lastUpdateStatus = 'Successful';

    functions.set(physicalId, fn);

    return {
      physicalId,
      attributes: { Arn: fn.functionArn },
    };
  },
  delete(physicalId: string): void {
    deleteFunctionState(physicalId);
  },
};
