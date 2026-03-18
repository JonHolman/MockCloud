import { beforeEach, describe, expect, test } from 'vitest';
import type { ProvisionContext } from '../../src/services/cloudformation/engine/types.js';
import { iamManagedPolicyProvider } from '../../src/services/cloudformation/engine/providers/iam-managed-policy.js';
import { getPoliciesStore } from '../../src/services/iam/types.js';

const context: ProvisionContext = {
  stackName: 'unit-iam-managed-policy-stack',
  region: 'us-east-1',
  accountId: '000000000000',
  resolvedResources: new Map(),
};

describe('iamManagedPolicyProvider', () => {
  beforeEach(() => {
    getPoliciesStore().clear();
  });

  test('allocates monotonic version ids when stored versions have gaps', async () => {
    const created = await iamManagedPolicyProvider.create('ManagedPolicy', {
      ManagedPolicyName: 'gap-policy',
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Action: 'logs:CreateLogGroup', Resource: '*' }],
      },
    }, context);

    const policies = getPoliciesStore();
    const existing = policies.get(created.physicalId)!;
    existing.versions.set('v3', JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: 'logs:CreateLogStream', Resource: '*' }],
    }));
    existing.DefaultVersionId = 'v3';
    policies.set(created.physicalId, existing);

    await iamManagedPolicyProvider.update!(
      created.physicalId,
      'ManagedPolicy',
      {
        ManagedPolicyName: 'gap-policy',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Action: 'logs:PutLogEvents', Resource: '*' }],
        },
      },
      context,
    );

    const updated = policies.get(created.physicalId)!;
    expect(updated.DefaultVersionId).toBe('v4');
    expect(Array.from(updated.versions.keys())).toEqual(['v1', 'v3', 'v4']);
  });
});
