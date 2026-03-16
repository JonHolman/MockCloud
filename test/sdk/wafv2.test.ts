import { describe, test, expect } from 'vitest';
import {
  ListWebACLsCommand,
  ListRuleGroupsCommand,
} from '@aws-sdk/client-wafv2';
import { createWAFv2Client } from './client-factory.js';

describe('WAFv2', () => {
  const client = createWAFv2Client();

  test('ListWebACLs returns web ACLs', async () => {
    const result = await client.send(new ListWebACLsCommand({ Scope: 'REGIONAL' }));
    expect(result.WebACLs).toBeDefined();
  });

  test('ListRuleGroups returns rule groups', async () => {
    const result = await client.send(new ListRuleGroupsCommand({ Scope: 'REGIONAL' }));
    expect(result.RuleGroups).toBeDefined();
  });
});
