import { defineMockService } from '../service.js';
import { json } from '../response.js';

// Services available in NAWS
const SERVICES = [
  { name: 'S3', shortName: 's3', description: 'Scalable storage in the cloud', url: '/s3/home' },
  { name: 'IAM', shortName: 'iam', description: 'Manage access to AWS resources', url: '/iam/home' },
  { name: 'Lambda', shortName: 'lambda', description: 'Run code without thinking about servers', url: '/lambda/home' },
  { name: 'DynamoDB', shortName: 'dynamodb', description: 'Managed NoSQL database', url: '/dynamodbv2/home' },
  { name: 'CloudFormation', shortName: 'cloudformation', description: 'Create and manage resources with templates', url: '/cloudformation/home' },
  { name: 'API Gateway', shortName: 'apigateway', description: 'Build, deploy, and manage APIs', url: '/apigateway/main/apis' },
  { name: 'Secrets Manager', shortName: 'secretsmanager', description: 'Rotate, manage, and retrieve secrets', url: '/secretsmanager/listsecrets' },
  { name: 'Cognito', shortName: 'cognito', description: 'Identity and user management', url: '/cognito/v2/idp/user-pools' },
  { name: 'WAF', shortName: 'wafv2', description: 'Web application firewall', url: '/wafv2/homev2' },
  { name: 'KMS', shortName: 'kms', description: 'Create and manage encryption keys', url: '/kms/home' },
  { name: 'EventBridge', shortName: 'eventbridge', description: 'Serverless event bus', url: '/events/home' },
  { name: 'Systems Manager', shortName: 'ssm', description: 'Operational insights and action', url: '/systems-manager/parameters' },
  { name: 'CloudWatch Logs', shortName: 'cloudwatch', description: 'Monitor logs and metrics', url: '/cloudwatch/home' },
  { name: 'STS', shortName: 'sts', description: 'Security Token Service', url: '/sts/home' },
];

export const unifiedSearchService = defineMockService({
  name: 'unified-search',
  hostPatterns: ['unifiedsearch.amazonaws.com', '*.unifiedsearch.amazonaws.com'],
  protocol: 'rest-json',
  handlers: {
    _default: (req) => {
      const { query, providers } = req.body as {
        query?: string;
        providers?: Array<{ providerName: string; pagination?: { count?: number; offset?: number } }>;
      };

      const q = (query ?? '').toLowerCase().trim();

      const responseProviders = (providers ?? []).map((provider) => {
        if (provider.providerName !== 'services' || !q) {
          return { providerName: provider.providerName, results: [], totalResultCount: 0 };
        }

        const limit = provider.pagination?.count ?? 4;
        const matches = SERVICES.filter(
          (s) => s.name.toLowerCase().includes(q) || s.shortName.includes(q),
        );

        return {
          providerName: 'services',
          results: matches.slice(0, limit).map((s) => ({
            title: s.name,
            description: s.description,
            url: s.url,
            additionalProperties: { shortName: s.shortName },
          })),
          totalResultCount: matches.length,
        };
      });

      return json({ providers: responseProviders });
    },
  },
});
