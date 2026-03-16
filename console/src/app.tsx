import { lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AppLayout from '@cloudscape-design/components/app-layout';
import SideNavigation, { SideNavigationProps } from '@cloudscape-design/components/side-navigation';
import Spinner from '@cloudscape-design/components/spinner';

const Home = lazy(() => import('./pages/home'));
const Stacks = lazy(() => import('./pages/cloudformation/stacks'));
const StackDetail = lazy(() => import('./pages/cloudformation/stack-detail'));
const Functions = lazy(() => import('./pages/lambda/functions'));
const FunctionDetail = lazy(() => import('./pages/lambda/function-detail'));
const Tables = lazy(() => import('./pages/dynamodb/tables'));
const TableDetail = lazy(() => import('./pages/dynamodb/table-detail'));
const Buckets = lazy(() => import('./pages/s3/buckets'));
const BucketDetail = lazy(() => import('./pages/s3/bucket-detail'));
const Roles = lazy(() => import('./pages/iam/roles'));
const RoleDetail = lazy(() => import('./pages/iam/role-detail'));
const UserPools = lazy(() => import('./pages/cognito/user-pools'));
const UserPoolDetail = lazy(() => import('./pages/cognito/user-pool-detail'));
const IdentityPools = lazy(() => import('./pages/cognito/identity-pools'));
const Apis = lazy(() => import('./pages/apigateway/apis'));
const ApiDetail = lazy(() => import('./pages/apigateway/api-detail'));
const Parameters = lazy(() => import('./pages/ssm/parameters'));
const Keys = lazy(() => import('./pages/kms/keys'));
const LogGroups = lazy(() => import('./pages/logs/log-groups'));
const Rules = lazy(() => import('./pages/eventbridge/rules'));
const SecurityGroups = lazy(() => import('./pages/ec2/security-groups'));
const Secrets = lazy(() => import('./pages/secretsmanager/secrets'));
const WebAcls = lazy(() => import('./pages/wafv2/web-acls'));
const KeyDetail = lazy(() => import('./pages/kms/key-detail'));
const LogGroupDetail = lazy(() => import('./pages/logs/log-group-detail'));
const RuleDetail = lazy(() => import('./pages/eventbridge/rule-detail'));
const SecurityGroupDetail = lazy(() => import('./pages/ec2/security-group-detail'));
const MalwareProtectionPlans = lazy(() => import('./pages/guardduty/malware-protection-plans'));
const WebAclDetail = lazy(() => import('./pages/wafv2/web-acl-detail'));

const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: 'link', text: 'Home', href: '/' },
  { type: 'divider' },
  { type: 'link', text: 'CloudFormation', href: '/cloudformation' },
  { type: 'link', text: 'Lambda', href: '/lambda' },
  { type: 'link', text: 'DynamoDB', href: '/dynamodb' },
  { type: 'link', text: 'S3', href: '/s3' },
  { type: 'link', text: 'IAM Roles', href: '/iam' },
  { type: 'link', text: 'Cognito', href: '/cognito' },
  { type: 'link', text: 'Identity Pools', href: '/cognito/identity-pools' },
  { type: 'link', text: 'API Gateway', href: '/apigateway' },
  { type: 'link', text: 'SSM', href: '/ssm' },
  { type: 'link', text: 'KMS', href: '/kms' },
  { type: 'link', text: 'CloudWatch Logs', href: '/logs' },
  { type: 'link', text: 'EventBridge', href: '/eventbridge' },
  { type: 'link', text: 'GuardDuty', href: '/guardduty' },
  { type: 'link', text: 'Security Groups', href: '/ec2' },
  { type: 'link', text: 'Secrets Manager', href: '/secretsmanager' },
  { type: 'link', text: 'WAFv2', href: '/wafv2' },
];

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AppLayout
      navigation={
        <SideNavigation
          header={{ text: 'NAWS Console', href: '/' }}
          activeHref={location.pathname}
          items={NAV_ITEMS}
          onFollow={(e) => {
            e.preventDefault();
            navigate(e.detail.href);
          }}
        />
      }
      content={
        <Suspense fallback={<Spinner size="large" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/cloudformation" element={<Stacks />} />
            <Route path="/cloudformation/stacks/:stackName" element={<StackDetail />} />
            <Route path="/lambda" element={<Functions />} />
            <Route path="/lambda/functions/:functionName" element={<FunctionDetail />} />
            <Route path="/dynamodb" element={<Tables />} />
            <Route path="/dynamodb/tables/:tableName" element={<TableDetail />} />
            <Route path="/s3" element={<Buckets />} />
            <Route path="/s3/buckets/:bucketName" element={<BucketDetail />} />
            <Route path="/iam" element={<Roles />} />
            <Route path="/iam/roles/:roleName" element={<RoleDetail />} />
            <Route path="/cognito" element={<UserPools />} />
            <Route path="/cognito/user-pools/:userPoolId" element={<UserPoolDetail />} />
            <Route path="/cognito/identity-pools" element={<IdentityPools />} />
            <Route path="/apigateway" element={<Apis />} />
            <Route path="/apigateway/apis/:apiId" element={<ApiDetail />} />
            <Route path="/ssm" element={<Parameters />} />
            <Route path="/kms" element={<Keys />} />
            <Route path="/kms/keys/:keyId" element={<KeyDetail />} />
            <Route path="/logs" element={<LogGroups />} />
            <Route path="/logs/log-groups/*" element={<LogGroupDetail />} />
            <Route path="/eventbridge" element={<Rules />} />
            <Route path="/eventbridge/rules/:ruleName" element={<RuleDetail />} />
            <Route path="/ec2" element={<SecurityGroups />} />
            <Route path="/ec2/security-groups/:groupId" element={<SecurityGroupDetail />} />
            <Route path="/secretsmanager" element={<Secrets />} />
            <Route path="/guardduty" element={<MalwareProtectionPlans />} />
            <Route path="/wafv2" element={<WebAcls />} />
            <Route path="/wafv2/web-acls/:name/:id" element={<WebAclDetail />} />
          </Routes>
        </Suspense>
      }
      toolsHide
    />
  );
}
