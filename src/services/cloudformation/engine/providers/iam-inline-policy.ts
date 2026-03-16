import type { ResourceProvider, ProvisionResult } from '../types.js';
import { getRolesStore } from '../../../iam/types.js';

function normalizePolicyDocument(policyDocument: unknown): string {
  if (typeof policyDocument === 'string') {
    return policyDocument;
  }
  return JSON.stringify(policyDocument ?? {});
}

function normalizeRoleNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function makePhysicalId(policyName: string, roleNames: string[]): string {
  return `iam-inline-policy:${encodeURIComponent(policyName)}:${roleNames.map((role) => encodeURIComponent(role)).join(',')}`;
}

function parsePhysicalId(physicalId: string): { policyName: string; roleNames: string[] } {
  const match = /^iam-inline-policy:([^:]*):(.*)$/.exec(physicalId);
  if (!match) {
    return {
      policyName: physicalId,
      roleNames: [],
    };
  }

  return {
    policyName: decodeURIComponent(match[1]),
    roleNames: match[2]
      ? match[2].split(',').filter(Boolean).map((role) => decodeURIComponent(role))
      : [],
  };
}

function detachInlinePolicy(physicalId: string): void {
  const { policyName, roleNames } = parsePhysicalId(physicalId);
  if (!policyName) {
    return;
  }

  const roles = getRolesStore();
  for (const roleName of roleNames) {
    const role = roles.get(roleName);
    if (!role) {
      continue;
    }
    role.inlinePolicies.delete(policyName);
    roles.set(roleName, role);
  }
}

function attachInlinePolicy(policyName: string, roleNames: string[], policyDocument: string): void {
  if (!policyName) {
    throw new Error('IAM inline policy PolicyName is required');
  }
  if (roleNames.length === 0) {
    throw new Error('AWS::IAM::Policy requires at least one role in Roles');
  }

  const roles = getRolesStore();
  for (const roleName of roleNames) {
    const role = roles.get(roleName);
    if (!role) {
      throw new Error(`IAM role not found: ${roleName}`);
    }
    role.inlinePolicies.set(policyName, policyDocument);
    roles.set(roleName, role);
  }
}

export const iamInlinePolicyProvider: ResourceProvider = {
  type: 'AWS::IAM::Policy',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const policyName = properties.PolicyName as string;
    const roleNames = normalizeRoleNames(properties.Roles);
    const policyDocument = normalizePolicyDocument(properties.PolicyDocument);

    attachInlinePolicy(policyName, roleNames, policyDocument);

    return {
      physicalId: makePhysicalId(policyName, roleNames),
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    detachInlinePolicy(physicalId);

    const policyName = properties.PolicyName as string;
    const roleNames = normalizeRoleNames(properties.Roles);
    const policyDocument = normalizePolicyDocument(properties.PolicyDocument);

    attachInlinePolicy(policyName, roleNames, policyDocument);

    return {
      physicalId: makePhysicalId(policyName, roleNames),
      attributes: {},
    };
  },
  delete(physicalId: string): void {
    detachInlinePolicy(physicalId);
  },
};
