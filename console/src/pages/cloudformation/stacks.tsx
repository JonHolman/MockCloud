import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import TextFilter from '@cloudscape-design/components/text-filter';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Link from '@cloudscape-design/components/link';
import Spinner from '@cloudscape-design/components/spinner';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import Box from '@cloudscape-design/components/box';
import { useCollection } from '@cloudscape-design/collection-hooks';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Textarea from '@cloudscape-design/components/textarea';
import Checkbox from '@cloudscape-design/components/checkbox';
import { ListStacksCommand, DeleteStackCommand, CreateStackCommand, StackStatus, StackSummary } from '@aws-sdk/client-cloudformation';
import { cfn } from '../../api/clients';

function statusType(status: string | undefined): 'success' | 'error' | 'in-progress' | 'stopped' | 'info' {
  if (!status) return 'info';
  if (status.endsWith('_COMPLETE') && !status.startsWith('DELETE')) return 'success';
  if (status.endsWith('_FAILED') || status === 'ROLLBACK_COMPLETE') return 'error';
  if (status.endsWith('_IN_PROGRESS')) return 'in-progress';
  if (status === StackStatus.DELETE_COMPLETE) return 'stopped';
  return 'info';
}

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

export default function Stacks() {
  const navigate = useNavigate();
  const [stacks, setStacks] = useState<StackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTemplate, setCreateTemplate] = useState('');
  const [createCapNamedIam, setCreateCapNamedIam] = useState(true);
  const [creating, setCreating] = useState(false);

  const [deleteStack, setDeleteStack] = useState<StackSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await cfn.send(new ListStacksCommand({}));
      setStacks(
        (res.StackSummaries ?? []).filter(
          (s) => s.StackStatus !== StackStatus.DELETE_COMPLETE
        )
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const capabilities: ('CAPABILITY_NAMED_IAM')[] = [];
      if (createCapNamedIam) capabilities.push('CAPABILITY_NAMED_IAM');
      await cfn.send(new CreateStackCommand({
        StackName: createName,
        TemplateBody: createTemplate,
        Capabilities: capabilities,
      }));
      setShowCreate(false);
      setCreateName('');
      setCreateTemplate('');
      setCreateCapNamedIam(true);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteStack?.StackName) return;
    setDeleting(true);
    try {
      await cfn.send(new DeleteStackCommand({ StackName: deleteStack.StackName }));
      setDeleteStack(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(stacks, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.StackName ?? '').toLowerCase().includes(text.toLowerCase()),
    },
    sorting: {},
  });

  if (loading) return <Spinner size="large" />;
  if (error) return <Header variant="h1">Error: {error}</Header>;

  return (
    <SpaceBetween size="l">
      <Table
        {...collectionProps}
        header={
          <Header
            variant="h1"
            counter={`(${stacks.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create stack
              </Button>
            }
          >
            Stacks
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find stacks" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Stack Name',
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/cloudformation/stacks/${encodeURIComponent(item.StackName!)}`);
                }}
              >
                {item.StackName}
              </Link>
            ),
            sortingField: 'StackName',
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => (
              <StatusIndicator type={statusType(item.StackStatus)}>
                {item.StackStatus}
              </StatusIndicator>
            ),
            sortingField: 'StackStatus',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => formatDate(item.CreationTime),
            sortingField: 'CreationTime',
          },
          {
            id: 'updated',
            header: 'Updated',
            cell: (item) => formatDate(item.LastUpdatedTime),
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.StackStatusReason ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteStack(item)}>
                Delete
              </Button>
            ),
          },
        ]}
        items={items}
        variant="full-page"
        stickyHeader
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create stack"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} loading={creating} disabled={!createName || !createTemplate}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Stack name">
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-stack" />
          </FormField>
          <FormField label="Template file" description="Choose a .yml, .yaml, .json, or .template file">
            <input
              type="file"
              accept=".yml,.yaml,.json,.template"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setCreateTemplate(reader.result as string);
                reader.readAsText(file);
              }}
            />
          </FormField>
          <FormField label="Template body" description="Loaded from file above, or paste manually">
            <Textarea value={createTemplate} onChange={({ detail }) => setCreateTemplate(detail.value)} rows={16} />
          </FormField>
          <Checkbox checked={createCapNamedIam} onChange={({ detail }) => setCreateCapNamedIam(detail.checked)}>
            CAPABILITY_NAMED_IAM
          </Checkbox>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteStack !== null}
        onDismiss={() => setDeleteStack(null)}
        header="Delete stack"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteStack(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete stack <b>{deleteStack?.StackName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
