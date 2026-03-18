import type { MockServiceDefinition } from '../../types.js';
import { xml } from './state.js';
import { registerProvider } from './engine/provisioner.js';
import { s3BucketProvider } from './engine/providers/s3-bucket.js';
import { dynamodbTableProvider } from './engine/providers/dynamodb-table.js';
import { iamRoleProvider } from './engine/providers/iam-role.js';
import { lambdaFunctionProvider } from './engine/providers/lambda-function.js';
import { ssmParameterProvider } from './engine/providers/ssm-parameter.js';
import { logsLogGroupProvider } from './engine/providers/logs-log-group.js';
import { cognitoUserPoolProvider } from './engine/providers/cognito-user-pool.js';
import { cognitoUserPoolClientProvider } from './engine/providers/cognito-user-pool-client.js';
import { cognitoUserPoolDomainProvider } from './engine/providers/cognito-user-pool-domain.js';
import { cognitoUserPoolIdentityProviderProvider } from './engine/providers/cognito-user-pool-identity-provider.js';
import { cognitoIdentityPoolProvider } from './engine/providers/cognito-identity-pool.js';
import { cognitoIdentityPoolRoleAttachmentProvider } from './engine/providers/cognito-identity-pool-role-attachment.js';
import { apigatewayRestApiProvider } from './engine/providers/apigateway-rest-api.js';
import { apigatewayResourceProvider } from './engine/providers/apigateway-resource.js';
import { apigatewayMethodProvider } from './engine/providers/apigateway-method.js';
import { apigatewayDeploymentProvider } from './engine/providers/apigateway-deployment.js';
import { apigatewayStageProvider } from './engine/providers/apigateway-stage.js';
import { eventbridgeRuleProvider } from './engine/providers/eventbridge-rule.js';
import { kmsKeyProvider, kmsAliasProvider } from './engine/providers/kms-key.js';
import { customResourceProvider } from './engine/providers/custom-resource.js';
import { lambdaPermissionProvider, lambdaEventSourceMappingProvider } from './engine/providers/lambda-permission.js';
import { lambdaVersionProvider } from './engine/providers/lambda-version.js';
import { s3BucketPolicyProvider } from './engine/providers/s3-bucket-policy.js';
import { wafv2WebAclAssociationProvider, wafv2LoggingConfigurationProvider } from './engine/providers/wafv2-association.js';
import {
  apigatewayAccountProvider, apigatewayGatewayResponseProvider,
} from './engine/providers/apigateway-account.js';
import { iamInlinePolicyProvider } from './engine/providers/iam-inline-policy.js';
import { lambdaEventInvokeConfigProvider } from './engine/providers/lambda-event-invoke-config.js';
import { ec2SecurityGroupProvider } from './engine/providers/ec2-security-group.js';
import { wafv2WebAclProvider } from './engine/providers/wafv2-web-acl.js';

import { guardDutyMalwareProtectionPlanProvider } from './engine/providers/guardduty-malware-protection.js';
import { iamOidcProviderProvider } from './engine/providers/iam-oidc-provider.js';
import { ec2VpcEndpointProvider } from './engine/providers/ec2-vpc-endpoint.js';
import { logsResourcePolicyProvider } from './engine/providers/logs-resource-policy.js';
import { s3BucketNotificationsCustomProvider } from './engine/providers/s3-bucket-notifications-custom.js';
import { secretsmanagerSecretProvider } from './engine/providers/secretsmanager-secret.js';
import { iamManagedPolicyProvider } from './engine/providers/iam-managed-policy.js';
import {
  createStack, updateStack, deleteStack,
  describeStacks, listStacks,
  describeStackEvents, describeStackResources, listStackResources,
  getTemplate, validateTemplate, getTemplateSummary,
} from './stack-ops.js';
import {
  createChangeSet, describeChangeSet, executeChangeSet,
  listChangeSets, listExports, listImports,
} from './changeset-ops.js';

registerProvider(s3BucketProvider);
registerProvider(dynamodbTableProvider);
registerProvider(iamRoleProvider);
registerProvider(lambdaFunctionProvider);
registerProvider(ssmParameterProvider);
registerProvider(logsLogGroupProvider);
registerProvider(cognitoUserPoolProvider);
registerProvider(cognitoUserPoolClientProvider);
registerProvider(cognitoUserPoolDomainProvider);
registerProvider(cognitoUserPoolIdentityProviderProvider);
registerProvider(cognitoIdentityPoolProvider);
registerProvider(cognitoIdentityPoolRoleAttachmentProvider);
registerProvider(apigatewayRestApiProvider);
registerProvider(apigatewayResourceProvider);
registerProvider(apigatewayMethodProvider);
registerProvider(apigatewayDeploymentProvider);
registerProvider(apigatewayStageProvider);
registerProvider(eventbridgeRuleProvider);
registerProvider(kmsKeyProvider);
registerProvider(kmsAliasProvider);
registerProvider(customResourceProvider);
registerProvider(ec2SecurityGroupProvider);
registerProvider(wafv2WebAclProvider);
registerProvider(lambdaPermissionProvider);
registerProvider(lambdaEventSourceMappingProvider);
registerProvider(lambdaVersionProvider);
registerProvider(s3BucketPolicyProvider);
registerProvider(wafv2WebAclAssociationProvider);
registerProvider(wafv2LoggingConfigurationProvider);
registerProvider(apigatewayAccountProvider);
registerProvider(apigatewayGatewayResponseProvider);
registerProvider(iamInlinePolicyProvider);
registerProvider(lambdaEventInvokeConfigProvider);
registerProvider(guardDutyMalwareProtectionPlanProvider);
registerProvider(iamOidcProviderProvider);
registerProvider(ec2VpcEndpointProvider);
registerProvider(logsResourcePolicyProvider);
registerProvider(s3BucketNotificationsCustomProvider);
registerProvider(secretsmanagerSecretProvider);
registerProvider(iamManagedPolicyProvider);

export const cloudformationService: MockServiceDefinition = {
  name: 'cloudformation',
  hostPatterns: ['cloudformation.*.amazonaws.com'],
  protocol: 'query',
  signingName: 'cloudformation',
  handlers: {
    CreateStack: createStack,
    UpdateStack: updateStack,
    DeleteStack: deleteStack,
    DescribeStacks: describeStacks,
    ListStacks: listStacks,
    DescribeStackEvents: describeStackEvents,
    DescribeStackResources: describeStackResources,
    ListStackResources: listStackResources,
    GetTemplate: getTemplate,
    ValidateTemplate: validateTemplate,
    GetTemplateSummary: getTemplateSummary,

    CreateChangeSet: createChangeSet,
    DescribeChangeSet: describeChangeSet,
    ExecuteChangeSet: executeChangeSet,
    ListChangeSets: listChangeSets,
    ListExports: listExports,
    ListImports: listImports,

    DescribeAccountLimits: () =>
      xml('DescribeAccountLimits', `
        <AccountLimits>
          <member><Name>StackLimit</Name><Value>2000</Value></member>
          <member><Name>StackOutputsLimit</Name><Value>60</Value></member>
        </AccountLimits>`),

    ListTypes: () =>
      xml('ListTypes', '<TypeSummaries/>'),

    _default: () =>
      xml('Response', ''),
  },
};
