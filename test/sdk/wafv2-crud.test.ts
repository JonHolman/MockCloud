import { describe, test, expect } from 'vitest';
import {
  CreateWebACLCommand,
  GetWebACLCommand,
  UpdateWebACLCommand,
  DeleteWebACLCommand,
  ListWebACLsCommand,
  CreateIPSetCommand,
  GetIPSetCommand,
  ListIPSetsCommand,
  DeleteIPSetCommand,
} from '@aws-sdk/client-wafv2';
import { createWAFv2Client } from './client-factory.js';

describe('WAFv2 CRUD', () => {
  const client = createWAFv2Client();

  test('WebACL CRUD lifecycle', async () => {
    const aclName = `test-acl-${Date.now()}`;

    const createResult = await client.send(new CreateWebACLCommand({
      Name: aclName,
      Scope: 'REGIONAL',
      DefaultAction: { Allow: {} },
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: aclName,
      },
      Rules: [],
    }));
    expect(createResult.Summary?.Name).toBe(aclName);
    expect(createResult.Summary?.Id).toBeTruthy();
    expect(createResult.Summary?.LockToken).toBeTruthy();
    const aclId = createResult.Summary!.Id!;
    const lockToken = createResult.Summary!.LockToken!;

    const getResult = await client.send(new GetWebACLCommand({
      Name: aclName,
      Scope: 'REGIONAL',
      Id: aclId,
    }));
    expect(getResult.WebACL?.Name).toBe(aclName);
    expect(getResult.WebACL?.Id).toBe(aclId);
    expect(getResult.LockToken).toBe(lockToken);

    const updateResult = await client.send(new UpdateWebACLCommand({
      Name: aclName,
      Scope: 'REGIONAL',
      Id: aclId,
      LockToken: lockToken,
      DefaultAction: { Block: {} },
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: aclName,
      },
      Rules: [],
    }));
    expect(updateResult.NextLockToken).toBeTruthy();
    expect(updateResult.NextLockToken).not.toBe(lockToken);

    const listResult = await client.send(new ListWebACLsCommand({ Scope: 'REGIONAL' }));
    expect(listResult.WebACLs?.some(a => a.Id === aclId)).toBe(true);

    await client.send(new DeleteWebACLCommand({
      Name: aclName,
      Scope: 'REGIONAL',
      Id: aclId,
      LockToken: updateResult.NextLockToken,
    }));

    const listAfterDelete = await client.send(new ListWebACLsCommand({ Scope: 'REGIONAL' }));
    expect(listAfterDelete.WebACLs?.some(a => a.Id === aclId)).toBe(false);
  });

  test('IPSet CRUD lifecycle', async () => {
    const ipSetName = `test-ipset-${Date.now()}`;

    const createResult = await client.send(new CreateIPSetCommand({
      Name: ipSetName,
      Scope: 'REGIONAL',
      IPAddressVersion: 'IPV4',
      Addresses: ['10.0.0.0/8', '192.168.0.0/16'],
    }));
    expect(createResult.Summary?.Name).toBe(ipSetName);
    expect(createResult.Summary?.Id).toBeTruthy();
    const ipSetId = createResult.Summary!.Id!;

    const getResult = await client.send(new GetIPSetCommand({
      Name: ipSetName,
      Scope: 'REGIONAL',
      Id: ipSetId,
    }));
    expect(getResult.IPSet?.Name).toBe(ipSetName);
    expect(getResult.IPSet?.Addresses).toEqual(['10.0.0.0/8', '192.168.0.0/16']);

    const listResult = await client.send(new ListIPSetsCommand({ Scope: 'REGIONAL' }));
    expect(listResult.IPSets?.some(s => s.Id === ipSetId)).toBe(true);

    await client.send(new DeleteIPSetCommand({
      Name: ipSetName,
      Scope: 'REGIONAL',
      Id: ipSetId,
      LockToken: createResult.Summary!.LockToken,
    }));

    const listAfterDelete = await client.send(new ListIPSetsCommand({ Scope: 'REGIONAL' }));
    expect(listAfterDelete.IPSets?.some(s => s.Id === ipSetId)).toBe(false);
  });
});
