import { randomUUID } from 'node:crypto';
import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { webAcls, createWebAcl } from '../../../wafv2/index.js';

export const wafv2WebAclProvider: ResourceProvider = {
  type: 'AWS::WAFv2::WebACL',
  create(_logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const Name = (properties.Name as string) ?? _logicalId;
    const acl = createWebAcl(
      Name,
      (properties.Scope as string) ?? 'REGIONAL',
      (properties.Description as string) ?? '',
      (properties.DefaultAction as Record<string, unknown>) ?? { Allow: {} },
      (properties.Rules as unknown[]) ?? [],
      (properties.VisibilityConfig as Record<string, unknown>) ?? {},
    );
    return { physicalId: acl.Id, attributes: { Arn: acl.ARN, Id: acl.Id } };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const existing = webAcls.get(physicalId);
    const Name = (properties.Name as string) ?? existing?.Name ?? _logicalId;
    const Scope = (properties.Scope as string) ?? existing?.Scope ?? 'REGIONAL';
    const ARN = `arn:aws:wafv2:${context.region}:${context.accountId}:${Scope.toLowerCase()}/webacl/${Name}/${physicalId}`;
    const LockToken = randomUUID();
    webAcls.set(physicalId, {
      Id: physicalId, Name, Scope, ARN, LockToken,
      Description: (properties.Description as string) ?? existing?.Description ?? '',
      DefaultAction: (properties.DefaultAction as Record<string, unknown>) ?? existing?.DefaultAction ?? { Allow: {} },
      Rules: (properties.Rules as unknown[]) ?? existing?.Rules ?? [],
      VisibilityConfig: (properties.VisibilityConfig as Record<string, unknown>) ?? existing?.VisibilityConfig ?? {},
    });
    return { physicalId, attributes: { Arn: ARN, Id: physicalId } };
  },
  delete(physicalId: string): void {
    webAcls.delete(physicalId);
  },
};
