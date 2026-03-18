import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import type { StoredPolicy } from '../../../iam/types.js';
import { getPoliciesStore, getRolesStore, generatePolicyId, nextPolicyVersionId, policyArn } from '../../../iam/types.js';

function docString(doc: unknown): string {
  if (doc === undefined || doc === null) {
    throw new Error('PolicyDocument is required');
  }
  return typeof doc === 'object' ? JSON.stringify(doc) : (doc as string);
}

function policyAttributes(policy: StoredPolicy): Record<string, string> {
  return {
    Arn: policy.Arn,
    PolicyArn: policy.Arn,
    PolicyId: policy.PolicyId,
    DefaultVersionId: policy.DefaultVersionId,
    AttachmentCount: String(policy.AttachmentCount),
    CreateDate: policy.CreateDate,
    IsAttachable: 'true',
    PermissionsBoundaryUsageCount: '0',
  };
}

function createPolicyRecord(name: string, path: string, doc: string): StoredPolicy {
  const versions = new Map<string, string>();
  versions.set('v1', doc);
  return {
    PolicyName: name,
    PolicyId: generatePolicyId(),
    Arn: policyArn(path, name),
    Path: path,
    DefaultVersionId: 'v1',
    AttachmentCount: 0,
    CreateDate: new Date().toISOString(),
    versions,
  };
}

function attachPolicyToRoles(policyArnValue: string, roleNames: string[]): void {
  const roles = getRolesStore();
  for (const roleName of roleNames) {
    const role = roles.get(roleName);
    if (!role) continue;
    if (!role.attachedPolicies.includes(policyArnValue)) {
      role.attachedPolicies.push(policyArnValue);
      roles.set(roleName, role);
    }
  }
}

function detachPolicyFromRoles(policyArnValue: string, roleNames: string[]): void {
  const roles = getRolesStore();
  for (const roleName of roleNames) {
    const role = roles.get(roleName);
    if (!role) continue;
    role.attachedPolicies = role.attachedPolicies.filter((a) => a !== policyArnValue);
    roles.set(roleName, role);
  }
}

function rolesAttachedToPolicy(policyArnValue: string): string[] {
  const result: string[] = [];
  for (const [name, role] of getRolesStore()) {
    if (role.attachedPolicies.includes(policyArnValue)) result.push(name);
  }
  return result;
}

export const iamManagedPolicyProvider: ResourceProvider = {
  type: 'AWS::IAM::ManagedPolicy',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const name = (properties.ManagedPolicyName as string) ?? `${context.stackName}-${logicalId}`;
    const path = (properties.Path as string) ?? '/';
    const doc = docString(properties.PolicyDocument);
    const policies = getPoliciesStore();
    const policy = createPolicyRecord(name, path, doc);

    if (policies.has(policy.Arn)) {
      throw new Error(`Policy ${policy.Arn} already exists`);
    }

    policies.set(policy.Arn, policy);

    const roleNames = Array.isArray(properties.Roles) ? (properties.Roles as string[]) : [];
    if (roleNames.length > 0) {
      attachPolicyToRoles(policy.Arn, roleNames);
      policy.AttachmentCount = roleNames.length;
      policies.set(policy.Arn, policy);
    }

    return { physicalId: policy.Arn, attributes: policyAttributes(policy) };
  },
  update(physicalId: string, logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const policies = getPoliciesStore();
    const existing = policies.get(physicalId);
    if (!existing) {
      throw new Error(`Policy ${physicalId} not found`);
    }

    const nextName = (properties.ManagedPolicyName as string) ?? `${context.stackName}-${logicalId}`;
    const nextPath = (properties.Path as string) ?? '/';
    const nextArn = policyArn(nextPath, nextName);
    if (nextArn !== physicalId) {
      if (policies.has(nextArn)) {
        throw new Error(`Policy ${nextArn} already exists`);
      }
      detachPolicyFromRoles(physicalId, rolesAttachedToPolicy(physicalId));
      const replacement = createPolicyRecord(nextName, nextPath, docString(properties.PolicyDocument));
      policies.set(replacement.Arn, replacement);
      const newRoles = Array.isArray(properties.Roles) ? (properties.Roles as string[]) : [];
      if (newRoles.length > 0) {
        attachPolicyToRoles(replacement.Arn, newRoles);
        replacement.AttachmentCount = newRoles.length;
        policies.set(replacement.Arn, replacement);
      }
      return { physicalId: replacement.Arn, attributes: policyAttributes(replacement) };
    }

    if (properties.PolicyDocument !== undefined) {
      const doc = docString(properties.PolicyDocument);
      const currentDoc = existing.versions.get(existing.DefaultVersionId);
      if (doc !== currentDoc) {
        const versionId = nextPolicyVersionId(existing.versions);
        existing.versions.set(versionId, doc);
        existing.DefaultVersionId = versionId;
        policies.set(physicalId, existing);
      }
    }

    const oldRoles = rolesAttachedToPolicy(physicalId);
    const newRoles = Array.isArray(properties.Roles) ? (properties.Roles as string[]) : [];
    const toDetach = oldRoles.filter((r) => !newRoles.includes(r));
    const toAttach = newRoles.filter((r) => !oldRoles.includes(r));
    detachPolicyFromRoles(physicalId, toDetach);
    attachPolicyToRoles(physicalId, toAttach);
    existing.AttachmentCount = newRoles.length;
    policies.set(physicalId, existing);

    return { physicalId, attributes: policyAttributes(existing) };
  },
  delete(physicalId: string): void {
    detachPolicyFromRoles(physicalId, rolesAttachedToPolicy(physicalId));
    getPoliciesStore().delete(physicalId);
  },
};
