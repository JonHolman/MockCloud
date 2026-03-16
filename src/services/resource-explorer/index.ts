import { defineMockService } from '../service.js';
import { json } from '../response.js';
import { REGION, ACCOUNT_ID } from '../../config.js';

const SERVICES = [
  { name: 'S3', type: 's3:bucket', arn: `arn:aws:s3:::naws-bucket` },
  { name: 'IAM', type: 'iam:role', arn: `arn:aws:iam::${ACCOUNT_ID}:role/naws-role` },
  { name: 'Lambda', type: 'lambda:function', arn: `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:naws-function` },
  { name: 'DynamoDB', type: 'dynamodb:table', arn: `arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/naws-table` },
  { name: 'CloudFormation', type: 'cloudformation:stack', arn: `arn:aws:cloudformation:${REGION}:${ACCOUNT_ID}:stack/naws-stack/1` },
  { name: 'API Gateway', type: 'apigateway:restapi', arn: `arn:aws:apigateway:${REGION}::/restapis/naws-api` },
  { name: 'Secrets Manager', type: 'secretsmanager:secret', arn: `arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:naws-secret` },
  { name: 'Cognito', type: 'cognito-idp:userpool', arn: `arn:aws:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/${REGION}_naws` },
  { name: 'WAF', type: 'wafv2:webacl', arn: `arn:aws:wafv2:${REGION}:${ACCOUNT_ID}:regional/webacl/naws-acl/1` },
  { name: 'KMS', type: 'kms:key', arn: `arn:aws:kms:${REGION}:${ACCOUNT_ID}:key/naws-key-id` },
  { name: 'EventBridge', type: 'events:rule', arn: `arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/naws-rule` },
  { name: 'Systems Manager', type: 'ssm:parameter', arn: `arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/naws-param` },
  { name: 'CloudWatch Logs', type: 'logs:log-group', arn: `arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/naws/logs` },
  { name: 'STS', type: 'sts:assumed-role', arn: `arn:aws:sts::${ACCOUNT_ID}:assumed-role/naws-role/session` },
];

function globMatch(query: string, text: string): boolean {
  const q = query.toLowerCase().replace(/\*+$/, '');
  return text.toLowerCase().includes(q);
}

export const resourceExplorerService = defineMockService({
  name: 'resource-explorer-2',
  hostPatterns: ['resource-explorer-2.*.amazonaws.com', 'resource-explorer-2.amazonaws.com'],
  protocol: 'rest-json',
  handlers: {
    ListIndexes: () => json({
      Indexes: [{
        Arn: `arn:aws:resource-explorer-2:${REGION}:${ACCOUNT_ID}:index/naws-default`,
        Region: REGION,
        Type: 'AGGREGATOR',
      }],
    }),
    Search: (req) => {
      const { QueryString } = req.body as { QueryString?: string };
      const q = (QueryString ?? '').replace(/\*+$/, '').trim();
      const matches = q ? SERVICES.filter(s =>
        globMatch(q, s.name) || globMatch(q, s.type) || globMatch(q, s.arn),
      ) : [];
      return json({
        Count: { Complete: true, TotalResources: matches.length },
        Resources: matches.map(s => ({
          Arn: s.arn,
          LastReportedAt: new Date().toISOString(),
          OwningAccountId: ACCOUNT_ID,
          Properties: [],
          Region: REGION,
          ResourceType: s.type,
          Service: s.type.split(':')[0],
        })),
        ViewArn: `arn:aws:resource-explorer-2:${REGION}:${ACCOUNT_ID}:view/all-resources/default`,
      });
    },
    _default: () => json({}),
  },
});
