import type { ResourceProvider, ProvisionResult } from '../types.js';
import {
  eventInvokeConfigs,
  isoNow,
  lambdaEventInvokeConfigKey,
  makeQualifiedFunctionArn,
  resolveFunctionName,
  resolveFunctionTarget,
  functions,
} from '../../../lambda/state.js';

export const lambdaEventInvokeConfigProvider: ResourceProvider = {
  type: 'AWS::Lambda::EventInvokeConfig',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const target = resolveFunctionTarget(
      properties.FunctionName as string,
      properties.Qualifier as string | undefined,
    );
    const functionName = resolveFunctionName(target.functionName);
    if (!functions.has(functionName)) {
      throw new Error(`Lambda function not found: ${functionName}`);
    }
    const qualifier = target.qualifier;
    eventInvokeConfigs.set(lambdaEventInvokeConfigKey(functionName, qualifier), {
      functionName,
      qualifier,
      functionArn: makeQualifiedFunctionArn(functionName, qualifier),
      maximumRetryAttempts: properties.MaximumRetryAttempts as number | undefined,
      maximumEventAgeInSeconds: properties.MaximumEventAgeInSeconds as number | undefined,
      destinationConfig: properties.DestinationConfig as Record<string, unknown> | undefined,
      lastModified: isoNow(),
    });
    return {
      physicalId: lambdaEventInvokeConfigKey(functionName, qualifier),
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const target = resolveFunctionTarget(
      properties.FunctionName as string,
      properties.Qualifier as string | undefined,
    );
    const functionName = resolveFunctionName(target.functionName);
    const qualifier = target.qualifier;
    eventInvokeConfigs.set(physicalId, {
      functionName,
      qualifier,
      functionArn: makeQualifiedFunctionArn(functionName, qualifier),
      maximumRetryAttempts: properties.MaximumRetryAttempts as number | undefined,
      maximumEventAgeInSeconds: properties.MaximumEventAgeInSeconds as number | undefined,
      destinationConfig: properties.DestinationConfig as Record<string, unknown> | undefined,
      lastModified: isoNow(),
    });
    return {
      physicalId,
      attributes: {},
    };
  },
  delete(physicalId: string): void {
    eventInvokeConfigs.delete(physicalId);
  },
};
