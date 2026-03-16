import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { logGroups, groupArn, createLogGroup, deleteLogGroup } from '../../../logs/index.js';
import { ServiceError } from '../../../response.js';
import { parseTags } from './tags.js';

export const logsLogGroupProvider: ResourceProvider = {
  type: 'AWS::Logs::LogGroup',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const logGroupName = (properties.LogGroupName as string)
      ?? `/aws/cloudformation/${context.stackName}/${logicalId}`;

    createLogGroup(logGroupName, parseTags(properties.Tags), properties.RetentionInDays as number | undefined);

    return {
      physicalId: logGroupName,
      attributes: { Arn: groupArn(logGroupName) },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const existing = logGroups.get(physicalId);
    if (existing) {
      existing.retentionInDays = properties.RetentionInDays as number | undefined;
      existing.tags = parseTags(properties.Tags);
      logGroups.set(physicalId, existing);
    }
    return {
      physicalId,
      attributes: { Arn: groupArn(physicalId) },
    };
  },
  delete(physicalId: string): void {
    try {
      deleteLogGroup(physicalId);
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    }
  },
};
