import { defineMockService } from '../service.js';
import { json } from '../response.js';
import { getBaseUrl } from '../../server-url.js';
import { REGION } from '../../config.js';

const capturedServices = [
  { id: 's3', displayName: 'S3', path: '/s3/home' },
  { id: 'iam-console', displayName: 'IAM', path: '/iam/home' },
  { id: 'lam', displayName: 'Lambda', path: '/lambda/home#/functions' },
  { id: 'dynamodbv2', displayName: 'DynamoDB', path: '/dynamodbv2/home#tables' },
  { id: 'cfo', displayName: 'CloudFormation', path: '/cloudformation/home#/stacks' },
  { id: 'ag', displayName: 'API Gateway', path: '/apigateway/main/apis' },
  { id: 'secretsmanager', displayName: 'Secrets Manager', path: '/secretsmanager/listsecrets' },
  { id: 'maui', displayName: 'Cognito', path: '/cognito/v2/idp/user-pools' },
  { id: 'waf', displayName: 'WAF', path: '/wafv2/homev2/web-acls' },
  { id: 'kms', displayName: 'KMS', path: '/kms/home' },
  { id: 'events', displayName: 'EventBridge', path: '/events/home#/rules' },
  { id: 'systems-manager', displayName: 'Systems Manager', path: '/systems-manager/parameters' },
  { id: 'cw', displayName: 'CloudWatch', path: '/cloudwatch/home' },
  { id: 'ec2', displayName: 'EC2', path: '/ec2/home' },
];

function buildRecentItems() {
  const base = getBaseUrl();
  return capturedServices.map((s, i) => ({
    type: 'Service',
    serviceName: s.id,
    displayName: s.displayName,
    region: REGION,
    url: `${base}${s.path}`,
    lastAccessedTimestamp: Date.now() - i * 60000,
  }));
}

function buildSettingsRecentItems() {
  return capturedServices.map(s => ({
    type: 'service',
    value: s.id,
    additionalProperties: { href: s.path, displayName: s.displayName },
  }));
}

function buildSettingsFavoriteItems() {
  return capturedServices.slice(0, 5).map(s => ({
    type: 'service',
    value: s.id,
    additionalProperties: { href: s.path, displayName: s.displayName },
  }));
}

const tooltipsDismissed = [
  'UnifiedServicesMenuTooltipDismissed',
  'AccountColorTooltipDismissed',
  'CloudshellTooltipDismissed',
  'ConciergeTooltipDismissed',
  'NewSettingsTooltipDismissed',
  'NotificationBellTooltipDismissed',
  'QuickSettingsTooltipDismissed',
  'ResourcesSearchTooltipDismissed',
  'VpcSessionTooltipDismissed',
  'VRAnnouncementTooltipDismissed',
];

const staticSettings: Record<string, unknown> = {
  favoriteBarDisplay: { value: 'icon+text' },
  defaultRegion: { value: REGION },
  locale: { value: 'en' },
  colorTheme: { value: 'dark' },
  timezone: { value: 'UTC' },
  ...Object.fromEntries(tooltipsDismissed.map(k => [k, { value: true }])),
};

export const consoleControlService = defineMockService({
  name: 'console-control',
  hostPatterns: ['*.ccs.console.api.aws', '*.ccs.amazonaws.com', 'global.ccs.console.api.aws'],
  protocol: 'rest-json',
  handlers: {
    DiscoverEndpoint: () => json({
      Endpoint: `${getBaseUrl()}/api/${REGION}.ccs.console.api.aws`,
      region: REGION,
    }),
    GetCallerSettings: (req) => {
      const settingNames = (req.body.settingNames ?? []) as string[];
      const userAccount: Record<string, unknown> = {};
      for (const name of settingNames) {
        if (name === 'recentsConsole') {
          userAccount.recentsConsole = { value: buildSettingsRecentItems() };
        } else if (name === 'favoritesConsole') {
          userAccount.favoritesConsole = { value: buildSettingsFavoriteItems() };
        } else if (name in staticSettings) {
          userAccount[name] = staticSettings[name];
        }
      }
      return json({ settingsByScope: { userAccount } });
    },
    GetCallerDashboard: () => json({
      cards: [],
      widgets: [],
      announcements: [],
      insights: [],
      recentItems: [],
    }),
    BatchGetSetting: (req) => {
      const settingNames = (req.body.settingNames ?? []) as string[];
      const userAccount: Record<string, unknown> = {};
      for (const name of settingNames) {
        if (name === 'recentsConsole') {
          userAccount.recentsConsole = { value: buildSettingsRecentItems() };
        } else if (name === 'favoritesConsole') {
          userAccount.favoritesConsole = { value: buildSettingsFavoriteItems() };
        } else if (name in staticSettings) {
          userAccount[name] = staticSettings[name];
        }
      }
      return json({ settingsByScope: { userAccount } });
    },
    GetCallerRecents: () => json({
      recentItems: buildRecentItems(),
    }),
    GetCallerFavorites: () => json({
      favoriteItems: buildRecentItems(),
    }),
    UpdateCallerRecents: () => json({
      recentItems: [],
    }),
    UpdateCallerSettings: () => json({}),
    PutCallerSettings: () => json({}),
    _default: () => json({}),
  },
});
