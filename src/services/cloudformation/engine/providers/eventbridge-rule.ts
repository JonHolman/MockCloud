import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { putRule, deleteRule, targets } from '../../../eventbridge/index.js';
import type { EventTarget } from '../../../eventbridge/index.js';

function resolveEventPattern(properties: Record<string, unknown>): string | undefined {
  if (properties.EventPattern === undefined) return undefined;
  return typeof properties.EventPattern === 'string'
    ? properties.EventPattern
    : JSON.stringify(properties.EventPattern);
}

function resolveTargets(properties: Record<string, unknown>): EventTarget[] | undefined {
  if (!Array.isArray(properties.Targets)) return undefined;
  return (properties.Targets as Array<Record<string, unknown>>).map((t) => ({
    Id: t.Id as string,
    Arn: t.Arn as string,
    ...(t.RoleArn ? { RoleArn: t.RoleArn as string } : {}),
    ...(t.Input ? { Input: t.Input as string } : {}),
    ...(t.InputPath ? { InputPath: t.InputPath as string } : {}),
  }));
}

export const eventbridgeRuleProvider: ResourceProvider = {
  type: 'AWS::Events::Rule',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const ruleName = (properties.Name as string)
      ?? `${context.stackName}-${logicalId}`;

    const rule = putRule({
      name: ruleName,
      eventPattern: resolveEventPattern(properties),
      scheduleExpression: properties.ScheduleExpression as string | undefined,
      state: ((properties.State as string) ?? 'ENABLED') as 'ENABLED' | 'DISABLED',
      eventBusName: (properties.EventBusName as string) ?? 'default',
      description: properties.Description as string | undefined,
    });

    const ruleTargets = resolveTargets(properties);
    if (ruleTargets) targets.set(ruleName, ruleTargets);

    return {
      physicalId: ruleName,
      attributes: { Arn: rule.Arn! },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const rule = putRule({
      name: physicalId,
      eventPattern: resolveEventPattern(properties),
      scheduleExpression: properties.ScheduleExpression as string | undefined,
      state: ((properties.State as string) ?? 'ENABLED') as 'ENABLED' | 'DISABLED',
      eventBusName: (properties.EventBusName as string) ?? 'default',
      description: properties.Description as string | undefined,
    });

    const ruleTargets = resolveTargets(properties);
    if (ruleTargets) targets.set(physicalId, ruleTargets);

    return {
      physicalId,
      attributes: { Arn: rule.Arn! },
    };
  },
  delete(physicalId: string): void {
    try {
      deleteRule(physicalId);
    } catch {
      // Ignore if rule doesn't exist during stack deletion
    }
  },
};
