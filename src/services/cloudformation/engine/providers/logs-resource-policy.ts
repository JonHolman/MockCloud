import type { ResourceProvider, ProvisionResult } from '../types.js';
import { resourcePolicies, type ResourcePolicy } from '../../../logs/index.js';

export const logsResourcePolicyProvider: ResourceProvider = {
  type: 'AWS::Logs::ResourcePolicy',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const policyName = properties.PolicyName as string;
    const policyDocument = properties.PolicyDocument as string ?? '';

    const policy: ResourcePolicy = {
      policyName,
      policyDocument,
      lastUpdatedTime: Date.now(),
    };
    resourcePolicies.set(policyName, policy);

    return {
      physicalId: policyName,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const existing = resourcePolicies.get(physicalId);
    const policy: ResourcePolicy = {
      policyName: physicalId,
      policyDocument: (properties.PolicyDocument as string) ?? existing?.policyDocument ?? '',
      lastUpdatedTime: Date.now(),
    };
    resourcePolicies.set(physicalId, policy);

    return {
      physicalId,
      attributes: {},
    };
  },
  delete(physicalId: string): void {
    resourcePolicies.delete(physicalId);
  },
};
