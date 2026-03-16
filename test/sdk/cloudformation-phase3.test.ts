import { describe, test, expect } from 'vitest';
import {
  CreateStackCommand,
  DescribeStacksCommand,
  DescribeStackResourcesCommand,
  DeleteStackCommand,
} from '@aws-sdk/client-cloudformation';
import { GetRestApisCommand } from '@aws-sdk/client-api-gateway';
import { DescribeRuleCommand } from '@aws-sdk/client-eventbridge';
import { DescribeKeyCommand } from '@aws-sdk/client-kms';
import {
  createCloudFormationClient,
  createAPIGatewayClient,
  createEventBridgeClient,
  createKMSClient,
} from './client-factory.js';

const TEMPLATE = JSON.stringify({
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Phase 3 test: API Gateway, EventBridge, KMS, cross-stack exports',
  Resources: {
    MyApi: {
      Type: 'AWS::ApiGateway::RestApi',
      Properties: {
        Name: 'p3-test-api',
        Description: 'Phase 3 test API',
      },
    },
    MyResource: {
      Type: 'AWS::ApiGateway::Resource',
      Properties: {
        RestApiId: { Ref: 'MyApi' },
        ParentId: { 'Fn::GetAtt': ['MyApi', 'RootResourceId'] },
        PathPart: 'items',
      },
    },
    MyMethod: {
      Type: 'AWS::ApiGateway::Method',
      DependsOn: 'MyResource',
      Properties: {
        RestApiId: { Ref: 'MyApi' },
        ResourceId: { Ref: 'MyResource' },
        HttpMethod: 'GET',
        AuthorizationType: 'NONE',
      },
    },
    MyDeployment: {
      Type: 'AWS::ApiGateway::Deployment',
      DependsOn: 'MyMethod',
      Properties: {
        RestApiId: { Ref: 'MyApi' },
        Description: 'test deployment',
      },
    },
    MyStage: {
      Type: 'AWS::ApiGateway::Stage',
      Properties: {
        RestApiId: { Ref: 'MyApi' },
        StageName: 'prod',
        DeploymentId: { Ref: 'MyDeployment' },
      },
    },
    MyRule: {
      Type: 'AWS::Events::Rule',
      Properties: {
        Name: 'p3-test-rule',
        Description: 'Phase 3 test rule',
        EventPattern: '{"source":["my.app"]}',
        State: 'ENABLED',
      },
    },
    MyKey: {
      Type: 'AWS::KMS::Key',
      Properties: {
        Description: 'Phase 3 test key',
        KeyUsage: 'ENCRYPT_DECRYPT',
      },
    },
  },
  Outputs: {
    ApiId: {
      Value: { Ref: 'MyApi' },
      Export: { Name: 'p3-api-id' },
    },
    RuleArn: {
      Value: { 'Fn::GetAtt': ['MyRule', 'Arn'] },
    },
    KeyArn: {
      Value: { 'Fn::GetAtt': ['MyKey', 'Arn'] },
    },
    KeyId: {
      Value: { 'Fn::GetAtt': ['MyKey', 'KeyId'] },
    },
  },
});

const IMPORT_TEMPLATE = JSON.stringify({
  AWSTemplateFormatVersion: '2010-09-09',
  Resources: {
    Placeholder: {
      Type: 'AWS::S3::Bucket',
      Properties: {
        BucketName: 'p3-import-test-bucket',
      },
    },
  },
  Outputs: {
    ImportedApiId: {
      Value: { 'Fn::ImportValue': 'p3-api-id' },
    },
  },
});

describe('CloudFormation Phase 3', () => {
  test('API Gateway chain, EventBridge, KMS, and cross-stack Fn::ImportValue', async () => {
    const cf = createCloudFormationClient();
    const apigw = createAPIGatewayClient();
    const eb = createEventBridgeClient();
    const kms = createKMSClient();
    const stackName = `cf-phase3-test-${Date.now()}`;
    const importStackName = `cf-phase3-import-${Date.now()}`;

    console.log('Phase 3: CreateStack with API Gateway chain + EventBridge + KMS...');
    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: TEMPLATE,
    }));

    console.log('Phase 3: DescribeStacks...');
    const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = desc.Stacks?.[0];
    expect(stack?.StackStatus).toBe('CREATE_COMPLETE');
    console.log('  Status:', stack?.StackStatus);

    console.log('Phase 3: Check all 7 resources exist...');
    const res = await cf.send(new DescribeStackResourcesCommand({ StackName: stackName }));
    const resourceIds = res.StackResources!.map(r => r.LogicalResourceId).sort();
    const expected = ['MyApi', 'MyDeployment', 'MyKey', 'MyMethod', 'MyResource', 'MyRule', 'MyStage'];
    expect(resourceIds).toEqual(expected);
    console.log('  Resources:', resourceIds.join(', '));

    console.log('Phase 3: Check outputs...');
    const outputs = stack!.Outputs!;
    const apiIdOut = outputs.find(o => o.OutputKey === 'ApiId');
    const ruleArnOut = outputs.find(o => o.OutputKey === 'RuleArn');
    const keyArnOut = outputs.find(o => o.OutputKey === 'KeyArn');
    const keyIdOut = outputs.find(o => o.OutputKey === 'KeyId');
    expect(apiIdOut).toBeTruthy();
    expect(ruleArnOut).toBeTruthy();
    expect(keyArnOut).toBeTruthy();
    expect(keyIdOut).toBeTruthy();
    console.log('  ApiId:', apiIdOut!.OutputValue);
    console.log('  RuleArn:', ruleArnOut!.OutputValue);
    console.log('  KeyArn:', keyArnOut!.OutputValue);
    console.log('  KeyId:', keyIdOut!.OutputValue);

    console.log('Phase 3: Verify API Gateway REST API via SDK...');
    const apisResult = await apigw.send(new GetRestApisCommand({}));
    const foundApi = apisResult.items?.find(a => a.id === apiIdOut!.OutputValue);
    expect(foundApi).toBeTruthy();
    expect(foundApi!.name).toBe('p3-test-api');
    console.log('  Found API:', foundApi!.name, 'id:', foundApi!.id);

    console.log('Phase 3: Verify EventBridge rule via SDK...');
    const ruleResult = await eb.send(new DescribeRuleCommand({ Name: 'p3-test-rule' }));
    expect(ruleResult.Name).toBe('p3-test-rule');
    expect(ruleResult.State).toBe('ENABLED');
    expect(ruleResult.Arn).toBeTruthy();
    console.log('  Found rule:', ruleResult.Name, 'state:', ruleResult.State);

    console.log('Phase 3: Verify KMS key via SDK...');
    const keyResult = await kms.send(new DescribeKeyCommand({ KeyId: keyIdOut!.OutputValue! }));
    expect(keyResult.KeyMetadata).toBeTruthy();
    expect(keyResult.KeyMetadata!.KeyId).toBe(keyIdOut!.OutputValue);
    expect(keyResult.KeyMetadata!.Description).toBe('Phase 3 test key');
    expect(keyResult.KeyMetadata!.KeyUsage).toBe('ENCRYPT_DECRYPT');
    console.log('  Found key:', keyResult.KeyMetadata!.KeyId, 'usage:', keyResult.KeyMetadata!.KeyUsage);

    console.log('Phase 3: CreateStack with Fn::ImportValue (cross-stack)...');
    await cf.send(new CreateStackCommand({
      StackName: importStackName,
      TemplateBody: IMPORT_TEMPLATE,
    }));

    const importDesc = await cf.send(new DescribeStacksCommand({ StackName: importStackName }));
    const importStack = importDesc.Stacks?.[0];
    expect(importStack?.StackStatus).toBe('CREATE_COMPLETE');
    console.log('  Status:', importStack?.StackStatus);

    const importedApiId = importStack!.Outputs!.find(o => o.OutputKey === 'ImportedApiId');
    expect(importedApiId).toBeTruthy();
    expect(importedApiId!.OutputValue).toBe(apiIdOut!.OutputValue);
    console.log('  ImportedApiId:', importedApiId!.OutputValue, '(matches original:', apiIdOut!.OutputValue, ')');

    console.log('Phase 3: Cleanup - delete both stacks...');
    await cf.send(new DeleteStackCommand({ StackName: importStackName }));
    console.log('  Deleted', importStackName);
    await cf.send(new DeleteStackCommand({ StackName: stackName }));
    console.log('  Deleted', stackName);
  });
});
