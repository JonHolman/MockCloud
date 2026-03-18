import { describe, expect, test } from 'vitest';
import {
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation';
import {
  DescribeSecretCommand,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { GetPolicyCommand } from '@aws-sdk/client-iam';
import {
  createCloudFormationClient,
  createIAMClient,
  createSecretsManagerClient,
} from './client-factory.js';

describe('CloudFormation provider regressions', () => {
  test('Secrets Manager metadata updates do not create a new secret version', async () => {
    const cf = createCloudFormationClient();
    const secrets = createSecretsManagerClient();
    const stackName = `cf-secret-update-${Date.now()}`;
    const secretName = `${stackName}-secret`;

    const initialTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        AppSecret: {
          Type: 'AWS::SecretsManager::Secret',
          Properties: {
            Name: secretName,
            Description: 'before',
            SecretString: 'initial-value',
            Tags: [{ Key: 'env', Value: 'dev' }],
          },
        },
      },
    });

    const updatedTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        AppSecret: {
          Type: 'AWS::SecretsManager::Secret',
          Properties: {
            Name: secretName,
            Description: 'after',
            SecretString: 'initial-value',
            Tags: [{ Key: 'env', Value: 'prod' }],
          },
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: initialTemplate,
    }));

    try {
      const before = await secrets.send(new GetSecretValueCommand({ SecretId: secretName }));

      await cf.send(new UpdateStackCommand({
        StackName: stackName,
        TemplateBody: updatedTemplate,
      }));

      const afterValue = await secrets.send(new GetSecretValueCommand({ SecretId: secretName }));
      const afterMetadata = await secrets.send(new DescribeSecretCommand({ SecretId: secretName }));

      expect(afterValue.VersionId).toBe(before.VersionId);
      expect(afterValue.SecretString).toBe('initial-value');
      expect(afterMetadata.Description).toBe('after');
      expect(afterMetadata.Tags).toEqual([{ Key: 'env', Value: 'prod' }]);
      expect(Object.keys(afterMetadata.VersionIdsToStages ?? {})).toHaveLength(1);
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName }));
    }
  });

  test('IAM managed policies expose CloudFormation GetAtt attributes', async () => {
    const cf = createCloudFormationClient();
    const iam = createIAMClient();
    const stackName = `cf-managed-policy-${Date.now()}`;

    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        ManagedPolicy: {
          Type: 'AWS::IAM::ManagedPolicy',
          Properties: {
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Action: 'logs:CreateLogGroup',
                Resource: '*',
              }],
            },
          },
        },
      },
      Outputs: {
        RefArn: { Value: { Ref: 'ManagedPolicy' } },
        PolicyArn: { Value: { 'Fn::GetAtt': ['ManagedPolicy', 'PolicyArn'] } },
        PolicyId: { Value: { 'Fn::GetAtt': ['ManagedPolicy', 'PolicyId'] } },
        DefaultVersionId: { Value: { 'Fn::GetAtt': ['ManagedPolicy', 'DefaultVersionId'] } },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
    }));

    try {
      const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
      const outputs = desc.Stacks?.[0]?.Outputs ?? [];
      const refArn = outputs.find((output) => output.OutputKey === 'RefArn')?.OutputValue;
      const policyArn = outputs.find((output) => output.OutputKey === 'PolicyArn')?.OutputValue;
      const policyId = outputs.find((output) => output.OutputKey === 'PolicyId')?.OutputValue;
      const defaultVersionId = outputs.find((output) => output.OutputKey === 'DefaultVersionId')?.OutputValue;

      expect(refArn).toBeTruthy();
      expect(policyArn).toBe(refArn);
      expect(policyId).toBeTruthy();
      expect(defaultVersionId).toBe('v1');

      const policy = await iam.send(new GetPolicyCommand({ PolicyArn: policyArn! }));
      expect(policy.Policy?.Arn).toBe(policyArn);
      expect(policy.Policy?.PolicyId).toBe(policyId);
      expect(policy.Policy?.DefaultVersionId).toBe(defaultVersionId);
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName }));
    }
  });

  test('IAM managed policy updates replace the policy when the name changes', async () => {
    const cf = createCloudFormationClient();
    const iam = createIAMClient();
    const stackName = `cf-managed-policy-rename-${Date.now()}`;
    const firstName = `${stackName}-one`;
    const secondName = `${stackName}-two`;
    const firstArn = `arn:aws:iam::000000000000:policy/${firstName}`;
    const secondArn = `arn:aws:iam::000000000000:policy/${secondName}`;

    const templateBody = (name: string, action: string) => JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        ManagedPolicy: {
          Type: 'AWS::IAM::ManagedPolicy',
          Properties: {
            ManagedPolicyName: name,
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Action: action,
                Resource: '*',
              }],
            },
          },
        },
      },
      Outputs: {
        RefArn: { Value: { Ref: 'ManagedPolicy' } },
        PolicyArn: { Value: { 'Fn::GetAtt': ['ManagedPolicy', 'PolicyArn'] } },
        DefaultVersionId: { Value: { 'Fn::GetAtt': ['ManagedPolicy', 'DefaultVersionId'] } },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody(firstName, 'logs:CreateLogGroup'),
    }));

    try {
      await cf.send(new UpdateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody(secondName, 'logs:CreateLogStream'),
      }));

      const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
      const outputs = desc.Stacks?.[0]?.Outputs ?? [];
      const refArn = outputs.find((output) => output.OutputKey === 'RefArn')?.OutputValue;
      const policyArn = outputs.find((output) => output.OutputKey === 'PolicyArn')?.OutputValue;
      const defaultVersionId = outputs.find((output) => output.OutputKey === 'DefaultVersionId')?.OutputValue;

      expect(refArn).toBe(secondArn);
      expect(policyArn).toBe(secondArn);
      expect(defaultVersionId).toBe('v1');

      const policy = await iam.send(new GetPolicyCommand({ PolicyArn: secondArn }));
      expect(policy.Policy?.Arn).toBe(secondArn);
      expect(policy.Policy?.DefaultVersionId).toBe('v1');

      try {
        await iam.send(new GetPolicyCommand({ PolicyArn: firstArn }));
        throw new Error(`Expected ${firstArn} to be deleted after replacement`);
      } catch (err: any) {
        expect(err.name).toBe('NoSuchEntityException');
      }
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName }));
    }
  });
});
