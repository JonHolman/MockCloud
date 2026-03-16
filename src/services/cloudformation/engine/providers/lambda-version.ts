import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import {
  functions,
  publishedVersions,
  isoNow,
  lambdaVersionKey,
  makeQualifiedFunctionArn,
  resolveFunctionName,
} from '../../../lambda/state.js';

function nextVersion(functionName: string): string {
  const versions = Array.from(publishedVersions.values())
    .filter((version) => version.functionName === functionName)
    .map((version) => Number(version.version))
    .filter((version) => Number.isFinite(version));
  const highest = versions.length > 0 ? Math.max(...versions) : 0;
  return String(highest + 1);
}

export const lambdaVersionProvider: ResourceProvider = {
  type: 'AWS::Lambda::Version',
  create(_logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const functionName = resolveFunctionName(properties.FunctionName as string);
    const fn = functions.get(functionName);
    if (!fn) {
      throw new Error(`Lambda function not found: ${functionName}`);
    }

    const version = nextVersion(functionName);
    const versionArn = makeQualifiedFunctionArn(functionName, version);
    publishedVersions.set(lambdaVersionKey(functionName, version), {
      ...fn,
      functionArn: versionArn,
      version,
      lastModified: isoNow(),
    });

    return {
      physicalId: versionArn,
      attributes: {
        Arn: versionArn,
        Version: version,
        FunctionArn: makeQualifiedFunctionArn(functionName, version),
      },
    };
  },
  update(physicalId: string): ProvisionResult {
    const parts = physicalId.split(':');
    const version = parts[7] ?? '1';
    const functionName = parts[6] ?? '';
    return {
      physicalId,
      attributes: {
        Arn: physicalId,
        Version: version,
        FunctionArn: makeQualifiedFunctionArn(functionName, version),
      },
    };
  },
  delete(physicalId: string): void {
    const parts = physicalId.split(':');
    const version = parts[7];
    const functionName = parts[6];
    if (!functionName || !version) return;
    publishedVersions.delete(lambdaVersionKey(functionName, version));
  },
};
