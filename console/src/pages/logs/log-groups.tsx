import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import TextFilter from '@cloudscape-design/components/text-filter';
import Spinner from '@cloudscape-design/components/spinner';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Link from '@cloudscape-design/components/link';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Box from '@cloudscape-design/components/box';
import { useCollection } from '@cloudscape-design/collection-hooks';
import {
  DescribeLogGroupsCommand,
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  LogGroup,
} from '@aws-sdk/client-cloudwatch-logs';
import { logs } from '../../api/clients';

function formatDate(epoch: number | undefined): string {
  if (!epoch) return '-';
  return new Date(epoch).toLocaleString();
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function LogGroups() {
  const navigate = useNavigate();
  const [logGroups, setLogGroups] = useState<LogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteGroup, setDeleteGroup] = useState<LogGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await logs.send(new DescribeLogGroupsCommand({}));
      setLogGroups(res.logGroups ?? []);
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
      await logs.send(new CreateLogGroupCommand({ logGroupName: createName }));
      setShowCreate(false);
      setCreateName('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteGroup?.logGroupName) return;
    setDeleting(true);
    try {
      await logs.send(new DeleteLogGroupCommand({ logGroupName: deleteGroup.logGroupName }));
      setDeleteGroup(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(logGroups, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.logGroupName ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${logGroups.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create log group
              </Button>
            }
          >
            CloudWatch Log Groups
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find log groups" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Log Group Name',
            cell: (item) => (
              <Link onFollow={(e) => { e.preventDefault(); navigate(`/logs/log-groups/${item.logGroupName}`); }}>
                {item.logGroupName ?? '-'}
              </Link>
            ),
            sortingField: 'logGroupName',
          },
          {
            id: 'storedBytes',
            header: 'Stored Bytes',
            cell: (item) => formatBytes(item.storedBytes),
            sortingField: 'storedBytes',
          },
          {
            id: 'retention',
            header: 'Retention (days)',
            cell: (item) => item.retentionInDays ?? 'Never expire',
            sortingField: 'retentionInDays',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => formatDate(item.creationTime),
            sortingField: 'creationTime',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteGroup(item)}>
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
        header="Create log group"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} loading={creating} disabled={!createName}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Log group name">
          <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="/my/log-group" />
        </FormField>
      </Modal>

      <Modal
        visible={deleteGroup !== null}
        onDismiss={() => setDeleteGroup(null)}
        header="Delete log group"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteGroup(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteGroup?.logGroupName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
