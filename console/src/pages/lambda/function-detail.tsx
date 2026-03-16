import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  GetFunctionCommand,
  InvokeCommand,
  DeleteFunctionCommand,
  UpdateFunctionConfigurationCommand,
  FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Container from '@cloudscape-design/components/container';
import Tabs from '@cloudscape-design/components/tabs';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Textarea from '@cloudscape-design/components/textarea';
import Modal from '@cloudscape-design/components/modal';
import Box from '@cloudscape-design/components/box';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Table from '@cloudscape-design/components/table';
import Spinner from '@cloudscape-design/components/spinner';
import { lambda } from '../../api/clients';

export default function FunctionDetail() {
  const { functionName } = useParams<{ functionName: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<FunctionConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState('{}');
  const [response, setResponse] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editMemory, setEditMemory] = useState('');
  const [editTimeout, setEditTimeout] = useState('');
  const [editEnvVars, setEditEnvVars] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    lambda.send(new GetFunctionCommand({ FunctionName: functionName })).then((res) => {
      setConfig(res.Configuration ?? null);
    }).catch((err) => {
      setError(String(err));
    }).finally(() => {
      setLoading(false);
    });
  }, [functionName]);

  const invoke = async () => {
    setInvoking(true);
    setResponse(null);
    try {
      const res = await lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          Payload: new TextEncoder().encode(payload),
        })
      );
      const body = res.Payload ? new TextDecoder().decode(res.Payload) : '';
      try {
        setResponse(JSON.stringify(JSON.parse(body), null, 2));
      } catch {
        setResponse(body);
      }
    } catch (err: unknown) {
      setResponse(String(err));
    } finally {
      setInvoking(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
      navigate('/lambda');
    } finally {
      setDeleting(false);
    }
  };

  const openEditModal = () => {
    if (!config) return;
    setEditDescription(config.Description ?? '');
    setEditMemory(String(config.MemorySize ?? 128));
    setEditTimeout(String(config.Timeout ?? 3));
    setEditEnvVars(JSON.stringify(config.Environment?.Variables ?? {}, null, 2));
    setShowEdit(true);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      let envVars: Record<string, string>;
      try {
        envVars = JSON.parse(editEnvVars);
      } catch {
        alert('Invalid JSON for environment variables');
        setSaving(false);
        return;
      }
      const res = await lambda.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Description: editDescription,
          MemorySize: parseInt(editMemory, 10) || 128,
          Timeout: parseInt(editTimeout, 10) || 3,
          Environment: { Variables: envVars },
        })
      );
      setConfig(res);
      setShowEdit(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner size="large" />;
  if (error) return <Header variant="h1">Error: {error}</Header>;
  if (!config) return <Header variant="h1">Function not found</Header>;

  const envVars = config.Environment?.Variables ?? {};

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: 'NAWS', href: '/' },
          { text: 'Lambda', href: '/lambda' },
          { text: 'Functions', href: '/lambda' },
          { text: functionName!, href: '' },
        ]}
        onFollow={(e) => {
          e.preventDefault();
          if (e.detail.href) navigate(e.detail.href);
        }}
      />
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => navigate(`/logs/log-groups/aws/lambda/${functionName}`)}>View logs</Button>
            <Button onClick={() => setShowDelete(true)}>Delete</Button>
            <Button variant="primary" onClick={invoke}>Invoke</Button>
          </SpaceBetween>
        }
      >
        {functionName}
      </Header>
      <Tabs
        tabs={[
          {
            label: 'Configuration',
            id: 'configuration',
            content: (
              <SpaceBetween size="l">
                <Container
                  header={
                    <Header
                      variant="h2"
                      actions={
                        <Button onClick={openEditModal}>Edit</Button>
                      }
                    >
                      General configuration
                    </Header>
                  }
                >
                  <KeyValuePairs
                    columns={2}
                    items={[
                      { label: 'Function ARN', value: config.FunctionArn ?? '-' },
                      { label: 'Runtime', value: config.Runtime ?? '-' },
                      { label: 'Handler', value: config.Handler ?? '-' },
                      { label: 'Memory (MB)', value: String(config.MemorySize ?? '-') },
                      { label: 'Timeout (s)', value: String(config.Timeout ?? '-') },
                      { label: 'Description', value: config.Description || '-' },
                      { label: 'Role', value: config.Role ?? '-' },
                    ]}
                  />
                </Container>
                {Object.keys(envVars).length > 0 && (
                  <Container header={<Header variant="h2">Environment variables</Header>}>
                    <Table
                      variant="embedded"
                      columnDefinitions={[
                        { id: 'key', header: 'Key', cell: (item: { key: string; value: string }) => item.key },
                        { id: 'value', header: 'Value', cell: (item: { key: string; value: string }) => item.value },
                      ]}
                      items={Object.entries(envVars).map(([k, v]) => ({ key: k, value: v }))}
                      sortingDisabled
                    />
                  </Container>
                )}
              </SpaceBetween>
            ),
          },
          {
            label: 'Test',
            id: 'test',
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Test event</Header>}>
                  <SpaceBetween size="m">
                    <FormField label="Event JSON">
                      <Textarea
                        value={payload}
                        onChange={({ detail }) => setPayload(detail.value)}
                        rows={10}
                      />
                    </FormField>
                    <Button variant="primary" onClick={invoke} loading={invoking}>
                      Invoke
                    </Button>
                  </SpaceBetween>
                </Container>
                {response !== null && (
                  <Container header={<Header variant="h2">Response</Header>}>
                    <pre style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0,
                      padding: '12px',
                      fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace",
                      fontSize: '13px',
                      lineHeight: '1.5',
                      backgroundColor: '#0f1b2a',
                      color: '#d1d5db',
                      borderRadius: '4px',
                    }}>
                      {response}
                    </pre>
                  </Container>
                )}
              </SpaceBetween>
            ),
          },
        ]}
      />

      <Modal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Delete function"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDelete(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{functionName}</b>? This action cannot be undone.
      </Modal>

      <Modal
        visible={showEdit}
        onDismiss={() => setShowEdit(false)}
        header="Edit configuration"
        size="large"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowEdit(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveConfig} loading={saving}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Description">
            <Input value={editDescription} onChange={({ detail }) => setEditDescription(detail.value)} />
          </FormField>
          <FormField label="Memory (MB)">
            <Input value={editMemory} onChange={({ detail }) => setEditMemory(detail.value)} type="number" />
          </FormField>
          <FormField label="Timeout (seconds)">
            <Input value={editTimeout} onChange={({ detail }) => setEditTimeout(detail.value)} type="number" />
          </FormField>
          <FormField label="Environment variables (JSON)">
            <Textarea value={editEnvVars} onChange={({ detail }) => setEditEnvVars(detail.value)} rows={8} />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
