import { randomUUID } from 'node:crypto';
import type { MockServiceDefinition } from '../../types.js';
import { jsonAmz11 as json, ServiceError } from '../response.js';
import { PersistentMap } from '../../state/store.js';
import { REGION, ACCOUNT_ID } from '../../config.js';

export interface WebAcl {
  Id: string;
  Name: string;
  Scope: string;
  ARN: string;
  LockToken: string;
  Description: string;
  DefaultAction: Record<string, unknown>;
  Rules: unknown[];
  VisibilityConfig: Record<string, unknown>;
}

export const ipSets = new PersistentMap<string, { Id: string; Name: string; Scope: string; ARN: string; LockToken: string; Addresses: string[]; IPAddressVersion: string; Description?: string }>('wafv2-ip-sets');

export const webAcls = new PersistentMap<string, WebAcl>('wafv2-web-acls');

export const webAclAssociations = new PersistentMap<string, { WebACLArn: string; ResourceArn: string }>('wafv2-associations');

export const loggingConfigs = new PersistentMap<string, { ResourceArn: string; LogDestinationConfigs: string[] }>('wafv2-logging-configs');

export function createWebAcl(
  name: string,
  scope: string,
  description: string,
  defaultAction: Record<string, unknown>,
  rules: unknown[],
  visibilityConfig: Record<string, unknown>,
): WebAcl {
  for (const existing of webAcls.values()) {
    if (existing.Name === name && existing.Scope === scope) {
      throw new ServiceError('WAFDuplicateItemException', `A WebACL with name '${name}' already exists for scope '${scope}'.`);
    }
  }
  const Id = randomUUID();
  const LockToken = randomUUID();
  const ARN = `arn:aws:wafv2:${REGION}:${ACCOUNT_ID}:${scope.toLowerCase()}/webacl/${name}/${Id}`;
  const acl: WebAcl = { Id, Name: name, Scope: scope, ARN, LockToken, Description: description, DefaultAction: defaultAction, Rules: rules, VisibilityConfig: visibilityConfig };
  webAcls.set(Id, acl);
  return acl;
}

export const wafv2Service: MockServiceDefinition = {
  name: 'wafv2',
  hostPatterns: ['wafv2.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'AWSWAF_20190729',
  signingName: 'wafv2',
  handlers: {
    ListWebACLs: () =>
      json({ WebACLs: [...webAcls.values()].map(a => ({ Name: a.Name, Id: a.Id, ARN: a.ARN, LockToken: a.LockToken })), NextMarker: null }),

    ListRuleGroups: () =>
      json({ RuleGroups: [], NextMarker: null }),

    GetWebACL: (req) => {
      const { Id } = req.body as Record<string, unknown>;
      const entry = webAcls.get(Id as string);
      if (!entry) return json({ __type: 'WAFNonexistentItemException', message: 'Not found' });
      return json({ WebACL: entry, LockToken: entry.LockToken });
    },

    CreateWebACL: (req) => {
      const { Name, Scope, Description, DefaultAction, Rules, VisibilityConfig } = req.body as Record<string, unknown>;
      try {
        const acl = createWebAcl(
          Name as string,
          (Scope as string) ?? 'REGIONAL',
          (Description as string) ?? '',
          (DefaultAction as Record<string, unknown>) ?? { Allow: {} },
          (Rules as unknown[]) ?? [],
          (VisibilityConfig as Record<string, unknown>) ?? {},
        );
        return json({ Summary: { Name: acl.Name, Id: acl.Id, ARN: acl.ARN, LockToken: acl.LockToken } });
      } catch (e) {
        if (e instanceof ServiceError) return json({ __type: e.code, message: e.message });
        throw e;
      }
    },

    UpdateWebACL: (req) => {
      const { Id, Name, Scope, Description, DefaultAction, Rules, VisibilityConfig } = req.body as Record<string, unknown>;
      const existing = webAcls.get(Id as string);
      if (!existing) return json({ __type: 'WAFNonexistentItemException', message: 'Not found' });
      const newLockToken = randomUUID();
      webAcls.set(Id as string, {
        ...existing,
        Name: (Name as string) ?? existing.Name,
        Scope: (Scope as string) ?? existing.Scope,
        Description: (Description as string) ?? existing.Description,
        DefaultAction: (DefaultAction as Record<string, unknown>) ?? existing.DefaultAction,
        Rules: (Rules as unknown[]) ?? existing.Rules,
        VisibilityConfig: (VisibilityConfig as Record<string, unknown>) ?? existing.VisibilityConfig,
        LockToken: newLockToken,
      });
      return json({ NextLockToken: newLockToken });
    },

    DeleteWebACL: (req) => {
      const { Id } = req.body as Record<string, unknown>;
      webAcls.delete(Id as string);
      return json({});
    },

    CreateIPSet: (req) => {
      const { Name, Scope, Addresses, IPAddressVersion, Description } = req.body as Record<string, unknown>;
      const Id = randomUUID();
      const LockToken = randomUUID();
      const scope = (Scope as string) ?? 'REGIONAL';
      const ARN = `arn:aws:wafv2:${REGION}:${ACCOUNT_ID}:${scope.toLowerCase()}/ipset/${Name}/${Id}`;
      ipSets.set(Id, { Id, Name: Name as string, Scope: scope, ARN, LockToken, Addresses: (Addresses as string[]) || [], IPAddressVersion: (IPAddressVersion as string) || 'IPV4', Description: Description as string | undefined });
      return json({ Summary: { Name, Id, ARN, LockToken } });
    },

    GetIPSet: (req) => {
      const { Id } = req.body as Record<string, unknown>;
      const entry = ipSets.get(Id as string);
      if (!entry) return json({ __type: 'WAFNonexistentItemException', message: 'Not found' });
      return json({ IPSet: entry, LockToken: entry.LockToken });
    },

    ListIPSets: () =>
      json({ IPSets: [...ipSets.values()].map(s => ({ Name: s.Name, Id: s.Id, ARN: s.ARN, LockToken: s.LockToken })), NextMarker: null }),

    DeleteIPSet: (req) => {
      const { Id } = req.body as Record<string, unknown>;
      ipSets.delete(Id as string);
      return json({});
    },

    AssociateWebACL: (req) => {
      const { WebACLArn, ResourceArn } = req.body as Record<string, unknown>;
      webAclAssociations.set(ResourceArn as string, { WebACLArn: WebACLArn as string, ResourceArn: ResourceArn as string });
      return json({});
    },

    DisassociateWebACL: (req) => {
      const { ResourceArn } = req.body as Record<string, unknown>;
      webAclAssociations.delete(ResourceArn as string);
      return json({});
    },

    GetWebACLForResource: (req) => {
      const { ResourceArn } = req.body as Record<string, unknown>;
      const assoc = webAclAssociations.get(ResourceArn as string);
      return json({ WebACL: assoc ? { ARN: assoc.WebACLArn } : undefined });
    },

    ListResourcesForWebACL: (req) => {
      const { WebACLArn } = req.body as Record<string, unknown>;
      const arns = [...webAclAssociations.values()]
        .filter(a => a.WebACLArn === (WebACLArn as string))
        .map(a => a.ResourceArn);
      return json({ ResourceArns: arns });
    },

    PutLoggingConfiguration: (req) => {
      const { LoggingConfiguration } = req.body as Record<string, unknown>;
      const config = LoggingConfiguration as { ResourceArn: string; LogDestinationConfigs: string[] };
      loggingConfigs.set(config.ResourceArn, { ResourceArn: config.ResourceArn, LogDestinationConfigs: config.LogDestinationConfigs });
      return json({ LoggingConfiguration: config });
    },

    GetLoggingConfiguration: (req) => {
      const { ResourceArn } = req.body as Record<string, unknown>;
      return json({ LoggingConfiguration: loggingConfigs.get(ResourceArn as string) });
    },

    ListLoggingConfigurations: () =>
      json({ LoggingConfigurations: [...loggingConfigs.values()], NextMarker: null }),

    DeleteLoggingConfiguration: (req) => {
      const { ResourceArn } = req.body as Record<string, unknown>;
      loggingConfigs.delete(ResourceArn as string);
      return json({});
    },

    ListTagsForResource: () =>
      json({ TagInfoForResource: { TagList: [], ResourceARN: '' } }),

    _default: () => json({}),
  },
};
