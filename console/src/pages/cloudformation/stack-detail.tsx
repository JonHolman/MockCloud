import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@cloudscape-design/components/header';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Tabs from '@cloudscape-design/components/tabs';
import Table from '@cloudscape-design/components/table';
import Container from '@cloudscape-design/components/container';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Button from '@cloudscape-design/components/button';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Spinner from '@cloudscape-design/components/spinner';
import Link from '@cloudscape-design/components/link';
import {
  DescribeStacksCommand,
  ListStackResourcesCommand,
  DescribeStackEventsCommand,
  GetTemplateCommand,
  DeleteStackCommand,
  Stack,
  StackResourceSummary,
  StackEvent,
  Parameter,
  Output,
} from '@aws-sdk/client-cloudformation';
import { cfn } from '../../api/clients';

function statusType(status: string | undefined): 'success' | 'error' | 'in-progress' | 'stopped' | 'info' {
  if (!status) return 'info';
  if (status.endsWith('_COMPLETE') && !status.startsWith('DELETE')) return 'success';
  if (status.endsWith('_FAILED') || status === 'ROLLBACK_COMPLETE') return 'error';
  if (status.endsWith('_IN_PROGRESS')) return 'in-progress';
  if (status.startsWith('DELETE')) return 'stopped';
  return 'info';
}

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <div>{children}</div>
    </div>
  );
}

const resourceRoutes: Record<string, (id: string) => string> = {
  'AWS::Lambda::Function': (id) => `/lambda/functions/${id}`,
  'AWS::DynamoDB::Table': (id) => `/dynamodb/tables/${id}`,
  'AWS::S3::Bucket': (id) => `/s3/buckets/${id}`,
  'AWS::IAM::Role': (id) => `/iam/roles/${id}`,
  'AWS::Cognito::UserPool': (id) => `/cognito/user-pools/${id}`,
  'AWS::ApiGateway::RestApi': (id) => `/apigateway/apis/${id}`,
  'AWS::KMS::Key': (id) => `/kms/keys/${id}`,
  'AWS::Logs::LogGroup': (id) => `/logs/log-groups/${id.replace(/^\//, '')}`,
  'AWS::Events::Rule': (id) => `/eventbridge/rules/${id}`,
  'AWS::EC2::SecurityGroup': (id) => `/ec2/security-groups/${id}`,
  'AWS::CloudFormation::Stack': (id) => {
    const name = id.includes('/') ? id.split('/')[1] : id.split(':').pop()!;
    return `/cloudformation/stacks/${name}`;
  },
};

export default function StackDetail() {
  const { stackName } = useParams<{ stackName: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stack, setStack] = useState<Stack | null>(null);
  const [resources, setResources] = useState<StackResourceSummary[]>([]);
  const [events, setEvents] = useState<StackEvent[]>([]);
  const [template, setTemplate] = useState('');

  useEffect(() => {
    if (!stackName) return;
    let cancelled = false;

    async function load() {
      try {
        const [descRes, resRes, eventsRes, tplRes] = await Promise.all([
          cfn.send(new DescribeStacksCommand({ StackName: stackName })),
          cfn.send(new ListStackResourcesCommand({ StackName: stackName })),
          cfn.send(new DescribeStackEventsCommand({ StackName: stackName })),
          cfn.send(new GetTemplateCommand({ StackName: stackName })),
        ]);
        if (cancelled) return;
        setStack(descRes.Stacks?.[0] ?? null);
        setResources(resRes.StackResourceSummaries ?? []);
        setEvents(eventsRes.StackEvents ?? []);
        setTemplate(tplRes.TemplateBody ?? '');
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [stackName]);

  async function handleDelete() {
    if (!confirm(`Delete stack "${stackName}"?`)) return;
    await cfn.send(new DeleteStackCommand({ StackName: stackName }));
    navigate('/cloudformation');
  }

  if (loading) return <Spinner size="large" />;
  if (error) return <Header variant="h1">Error: {error}</Header>;
  if (!stack) return <Header variant="h1">Stack not found</Header>;

  const outputs: Output[] = stack.Outputs ?? [];
  const parameters: Parameter[] = stack.Parameters ?? [];

  const overviewTab = (
    <Container header={<Header variant="h2">Stack Info</Header>}>
      <ColumnLayout columns={2} variant="text-grid">
        <KeyValue label="Stack Name">{stack.StackName}</KeyValue>
        <KeyValue label="Stack ID">{stack.StackId}</KeyValue>
        <KeyValue label="Status">
          <StatusIndicator type={statusType(stack.StackStatus)}>
            {stack.StackStatus}
          </StatusIndicator>
        </KeyValue>
        <KeyValue label="Description">{stack.Description ?? '-'}</KeyValue>
        <KeyValue label="Created">{formatDate(stack.CreationTime)}</KeyValue>
        <KeyValue label="Last Updated">{formatDate(stack.LastUpdatedTime)}</KeyValue>
      </ColumnLayout>
    </Container>
  );

  const resourcesTab = (
    <Table
      header={<Header counter={`(${resources.length})`}>Resources</Header>}
      columnDefinitions={[
        { id: 'logical', header: 'Logical ID', cell: (r) => r.LogicalResourceId },
        { id: 'type', header: 'Type', cell: (r) => r.ResourceType },
        {
          id: 'status',
          header: 'Status',
          cell: (r) => (
            <StatusIndicator type={statusType(r.ResourceStatus)}>
              {r.ResourceStatus}
            </StatusIndicator>
          ),
        },
        {
          id: 'physical',
          header: 'Physical ID',
          cell: (r) => {
            const pid = r.PhysicalResourceId;
            if (!pid) return '-';
            const toRoute = r.ResourceType ? resourceRoutes[r.ResourceType] : undefined;
            if (!toRoute) return pid;
            return (
              <Link onFollow={(e) => { e.preventDefault(); navigate(toRoute(pid)); }}>
                {pid}
              </Link>
            );
          },
        },
      ]}
      items={resources}
    />
  );

  const outputsTab = (
    <Table
      header={<Header counter={`(${outputs.length})`}>Outputs</Header>}
      columnDefinitions={[
        { id: 'key', header: 'Key', cell: (o) => o.OutputKey },
        { id: 'value', header: 'Value', cell: (o) => o.OutputValue },
        { id: 'desc', header: 'Description', cell: (o) => o.Description ?? '-' },
      ]}
      items={outputs}
      empty="No outputs"
    />
  );

  const parametersTab = (
    <Table
      header={<Header counter={`(${parameters.length})`}>Parameters</Header>}
      columnDefinitions={[
        { id: 'key', header: 'Parameter Key', cell: (p) => p.ParameterKey },
        { id: 'value', header: 'Parameter Value', cell: (p) => p.ParameterValue },
      ]}
      items={parameters}
      empty="No parameters"
    />
  );

  const eventsTab = (
    <Table
      header={<Header counter={`(${events.length})`}>Events</Header>}
      columnDefinitions={[
        { id: 'time', header: 'Timestamp', cell: (e) => formatDate(e.Timestamp) },
        { id: 'logical', header: 'Logical ID', cell: (e) => e.LogicalResourceId ?? '-' },
        {
          id: 'status',
          header: 'Status',
          cell: (e) => (
            <StatusIndicator type={statusType(e.ResourceStatus)}>
              {e.ResourceStatus}
            </StatusIndicator>
          ),
        },
        { id: 'reason', header: 'Reason', cell: (e) => e.ResourceStatusReason ?? '-' },
      ]}
      items={events}
    />
  );

  const formattedTemplate = (() => {
    try { return JSON.stringify(JSON.parse(template), null, 2); } catch { return template; }
  })();

  const templateTab = (
    <Container>
      <pre style={{
        whiteSpace: 'pre-wrap',
        maxHeight: '600px',
        overflow: 'auto',
        margin: 0,
        fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace",
        fontSize: '13px',
        lineHeight: '1.5',
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        padding: '16px',
        borderRadius: '4px',
      }}>
        {formattedTemplate}
      </pre>
    </Container>
  );

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: 'NAWS', href: '/' },
          { text: 'CloudFormation', href: '/cloudformation' },
          { text: 'Stacks', href: '/cloudformation' },
          { text: stackName!, href: '#' },
        ]}
        onFollow={(e) => {
          e.preventDefault();
          navigate(e.detail.href);
        }}
      />
      <Header
        variant="h1"
        actions={
          <Button variant="primary" onClick={handleDelete}>
            Delete
          </Button>
        }
      >
        {stackName}
      </Header>
      <Tabs
        tabs={[
          { label: 'Overview', id: 'overview', content: overviewTab },
          { label: 'Resources', id: 'resources', content: resourcesTab },
          { label: 'Outputs', id: 'outputs', content: outputsTab },
          { label: 'Parameters', id: 'parameters', content: parametersTab },
          { label: 'Events', id: 'events', content: eventsTab },
          { label: 'Template', id: 'template', content: templateTab },
        ]}
      />
    </SpaceBetween>
  );
}
