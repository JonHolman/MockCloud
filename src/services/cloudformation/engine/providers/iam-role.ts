import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { getRolesStore, createRole, deleteRole } from '../../../iam/types.js';

export const iamRoleProvider: ResourceProvider = {
  type: 'AWS::IAM::Role',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const roleName = (properties.RoleName as string) ?? `${context.stackName}-${logicalId}`;

    const assumeRolePolicyDocument = typeof properties.AssumeRolePolicyDocument === 'string'
      ? properties.AssumeRolePolicyDocument
      : JSON.stringify(properties.AssumeRolePolicyDocument ?? {});

    const inlinePolicies = new Map<string, string>();
    if (Array.isArray(properties.Policies)) {
      for (const p of properties.Policies) {
        const pol = p as Record<string, unknown>;
        inlinePolicies.set(
          pol.PolicyName as string,
          typeof pol.PolicyDocument === 'string' ? pol.PolicyDocument : JSON.stringify(pol.PolicyDocument),
        );
      }
    }

    const role = createRole({
      roleName,
      path: (properties.Path as string) ?? '/',
      assumeRolePolicyDocument,
      description: (properties.Description as string) ?? '',
      inlinePolicies,
      attachedPolicies: Array.isArray(properties.ManagedPolicyArns)
        ? (properties.ManagedPolicyArns as string[])
        : [],
    });

    return {
      physicalId: roleName,
      attributes: {
        Arn: role.Arn,
        RoleId: role.RoleId,
      },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const roles = getRolesStore();
    const role = roles.get(physicalId);
    if (!role) throw new Error(`IAM Role ${physicalId} not found`);

    role.AssumeRolePolicyDocument = typeof properties.AssumeRolePolicyDocument === 'string'
      ? properties.AssumeRolePolicyDocument
      : JSON.stringify(properties.AssumeRolePolicyDocument ?? {});

    role.Description = (properties.Description as string) ?? '';

    role.inlinePolicies = new Map();
    if (Array.isArray(properties.Policies)) {
      for (const p of properties.Policies) {
        const pol = p as Record<string, unknown>;
        role.inlinePolicies.set(
          pol.PolicyName as string,
          typeof pol.PolicyDocument === 'string' ? pol.PolicyDocument : JSON.stringify(pol.PolicyDocument),
        );
      }
    }

    role.attachedPolicies = Array.isArray(properties.ManagedPolicyArns)
      ? (properties.ManagedPolicyArns as string[])
      : [];

    roles.set(physicalId, role);

    return {
      physicalId,
      attributes: {
        Arn: role.Arn,
        RoleId: role.RoleId,
      },
    };
  },
  delete(physicalId: string): void {
    try {
      deleteRole(physicalId);
    } catch {
      // Ignore if role doesn't exist during stack deletion
    }
  },
};
