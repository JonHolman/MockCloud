import { describe, test, expect } from 'vitest';
import {
  CreateRoleCommand,
  GetRoleCommand,
  DeleteRoleCommand,
  ListRolesCommand,
  PutRolePolicyCommand,
  GetRolePolicyCommand,
  DeleteRolePolicyCommand,
  ListRolePoliciesCommand,
  AttachRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  CreatePolicyCommand,
  GetPolicyCommand,
  DeletePolicyCommand,
  ListPoliciesCommand,
  CreateUserCommand,
  ListUsersCommand,
  CreateOpenIDConnectProviderCommand,
} from '@aws-sdk/client-iam';
import { createIAMClient } from './client-factory.js';

describe('IAM CRUD', () => {
  const client = createIAMClient();

  test('Role CRUD lifecycle', async () => {
    const roleName = `test-role-${Date.now()}`;
    const assumeRolePolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
    });

    const createResult = await client.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
    }));
    expect(createResult.Role?.RoleName).toBe(roleName);
    expect(createResult.Role?.Arn).toContain(roleName);

    const getResult = await client.send(new GetRoleCommand({ RoleName: roleName }));
    expect(getResult.Role?.RoleName).toBe(roleName);

    const listResult = await client.send(new ListRolesCommand({}));
    expect(listResult.Roles?.some(r => r.RoleName === roleName)).toBe(true);

    await client.send(new DeleteRoleCommand({ RoleName: roleName }));

    try {
      await client.send(new GetRoleCommand({ RoleName: roleName }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('NoSuchEntityException');
    }
  });

  test('CreateRole rejects duplicate role names', async () => {
    const roleName = `test-dup-role-${Date.now()}`;
    const assumeRolePolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
    });

    await client.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
    }));

    try {
      await client.send(new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: assumeRolePolicy,
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('EntityAlreadyExistsException');
    } finally {
      await client.send(new DeleteRoleCommand({ RoleName: roleName }));
    }
  });

  test('Inline policy lifecycle on a role', async () => {
    const roleName = `test-inline-role-${Date.now()}`;
    const policyName = 'test-inline-policy';
    const policyDocument = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: 's3:GetObject', Resource: '*' }],
    });

    await client.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({ Version: '2012-10-17', Statement: [] }),
    }));

    try {
      await client.send(new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName,
        PolicyDocument: policyDocument,
      }));

      const listPolicies = await client.send(new ListRolePoliciesCommand({ RoleName: roleName }));
      expect(listPolicies.PolicyNames).toEqual([policyName]);

      const getPolicy = await client.send(new GetRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName,
      }));
      expect(getPolicy.RoleName).toBe(roleName);
      expect(getPolicy.PolicyName).toBe(policyName);
      const decodedDoc = decodeURIComponent(getPolicy.PolicyDocument ?? '');
      expect(decodedDoc).toContain('s3:GetObject');

      await client.send(new DeleteRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName,
      }));

      const afterDelete = await client.send(new ListRolePoliciesCommand({ RoleName: roleName }));
      expect(afterDelete.PolicyNames).toEqual([]);
    } finally {
      await client.send(new DeleteRoleCommand({ RoleName: roleName }));
    }
  });

  test('Attached policy lifecycle on a role', async () => {
    const roleName = `test-attach-role-${Date.now()}`;
    const policyArn = 'arn:aws:iam::aws:policy/ReadOnlyAccess';

    await client.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({ Version: '2012-10-17', Statement: [] }),
    }));

    try {
      await client.send(new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: policyArn,
      }));

      const listAttached = await client.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
      expect(listAttached.AttachedPolicies?.some(p => p.PolicyArn === policyArn)).toBe(true);
    } finally {
      await client.send(new DeleteRoleCommand({ RoleName: roleName }));
    }
  });

  test('Managed policy CRUD lifecycle', async () => {
    const policyName = `test-policy-${Date.now()}`;
    const policyDocument = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: 'logs:*', Resource: '*' }],
    });

    const createResult = await client.send(new CreatePolicyCommand({
      PolicyName: policyName,
      PolicyDocument: policyDocument,
    }));
    expect(createResult.Policy?.PolicyName).toBe(policyName);
    expect(createResult.Policy?.Arn).toContain(policyName);
    const arn = createResult.Policy!.Arn!;

    const getResult = await client.send(new GetPolicyCommand({ PolicyArn: arn }));
    expect(getResult.Policy?.PolicyName).toBe(policyName);

    const listResult = await client.send(new ListPoliciesCommand({}));
    expect(listResult.Policies?.some(p => p.Arn === arn)).toBe(true);

    await client.send(new DeletePolicyCommand({ PolicyArn: arn }));

    try {
      await client.send(new GetPolicyCommand({ PolicyArn: arn }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('NoSuchEntityException');
    }
  });

  test('CreateUser and verify in ListUsers', async () => {
    const userName = `test-user-${Date.now()}`;

    const createResult = await client.send(new CreateUserCommand({ UserName: userName }));
    expect(createResult.User?.UserName).toBe(userName);

    const listResult = await client.send(new ListUsersCommand({}));
    expect(listResult.Users?.some(u => u.UserName === userName)).toBe(true);
  });

  test('DeleteRole on nonexistent role returns NoSuchEntity', async () => {
    try {
      await client.send(new DeleteRoleCommand({ RoleName: 'nonexistent-role-crud-xyz' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('NoSuchEntityException');
    }
  });

  test('OIDC provider creation is a no-op', async () => {
    const createResult = await client.send(new CreateOpenIDConnectProviderCommand({
      Url: 'https://token.actions.githubusercontent.com',
      ClientIDList: ['sts.amazonaws.com'],
      ThumbprintList: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    }));
    expect(createResult.OpenIDConnectProviderArn).toBe(
      'arn:aws:iam::000000000000:oidc-provider/token.actions.githubusercontent.com',
    );
  });
});
