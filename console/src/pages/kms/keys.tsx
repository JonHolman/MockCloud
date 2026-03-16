import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import TextFilter from '@cloudscape-design/components/text-filter';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Spinner from '@cloudscape-design/components/spinner';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Link from '@cloudscape-design/components/link';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import Box from '@cloudscape-design/components/box';
import { useCollection } from '@cloudscape-design/collection-hooks';
import {
  ListKeysCommand,
  DescribeKeyCommand,
  CreateKeyCommand,
  ScheduleKeyDeletionCommand,
  KeyMetadata,
} from '@aws-sdk/client-kms';
import { kms } from '../../api/clients';

const KEY_USAGE_OPTIONS = [
  { label: 'ENCRYPT_DECRYPT', value: 'ENCRYPT_DECRYPT' },
  { label: 'SIGN_VERIFY', value: 'SIGN_VERIFY' },
];

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

function statusType(state: string | undefined): 'success' | 'error' | 'warning' | 'info' {
  if (state === 'Enabled') return 'success';
  if (state === 'Disabled') return 'error';
  if (state === 'PendingDeletion') return 'warning';
  return 'info';
}

export default function Keys() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<KeyMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createDesc, setCreateDesc] = useState('');
  const [createUsage, setCreateUsage] = useState(KEY_USAGE_OPTIONS[0]);
  const [creating, setCreating] = useState(false);

  const [deleteKey, setDeleteKey] = useState<KeyMetadata | null>(null);
  const [pendingDays, setPendingDays] = useState('7');
  const [schedulingDeletion, setSchedulingDeletion] = useState(false);

  const load = useCallback(async () => {
    try {
      const listRes = await kms.send(new ListKeysCommand({}));
      const keyEntries = listRes.Keys ?? [];
      const details = await Promise.all(
        keyEntries.map(async (k) => {
          const desc = await kms.send(new DescribeKeyCommand({ KeyId: k.KeyId! }));
          return desc.KeyMetadata!;
        })
      );
      setKeys(details);
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
      await kms.send(
        new CreateKeyCommand({
          Description: createDesc || undefined,
          KeyUsage: createUsage.value as 'ENCRYPT_DECRYPT' | 'SIGN_VERIFY',
        })
      );
      setShowCreate(false);
      setCreateDesc('');
      setCreateUsage(KEY_USAGE_OPTIONS[0]);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleScheduleDeletion = async () => {
    if (!deleteKey?.KeyId) return;
    setSchedulingDeletion(true);
    try {
      await kms.send(
        new ScheduleKeyDeletionCommand({
          KeyId: deleteKey.KeyId,
          PendingWindowInDays: parseInt(pendingDays, 10) || 7,
        })
      );
      setDeleteKey(null);
      setPendingDays('7');
      await load();
    } finally {
      setSchedulingDeletion(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(keys, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.KeyId ?? '').toLowerCase().includes(text.toLowerCase()) ||
        (item.Description ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${keys.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create key
              </Button>
            }
          >
            KMS Keys
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find keys" />}
        columnDefinitions={[
          {
            id: 'keyId',
            header: 'Key ID',
            cell: (item) => (
              <Link onFollow={(e) => { e.preventDefault(); navigate(`/kms/keys/${item.KeyId}`); }}>
                {item.KeyId ?? '-'}
              </Link>
            ),
            sortingField: 'KeyId',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.Arn ?? '-',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description || '-',
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => (
              <StatusIndicator type={statusType(item.KeyState)}>
                {item.KeyState}
              </StatusIndicator>
            ),
            sortingField: 'KeyState',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => formatDate(item.CreationDate),
            sortingField: 'CreationDate',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) =>
              item.KeyState !== 'PendingDeletion' ? (
                <Button variant="inline-link" onClick={() => setDeleteKey(item)}>
                  Schedule deletion
                </Button>
              ) : (
                '-'
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
        header="Create key"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} loading={creating}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Description">
            <Input value={createDesc} onChange={({ detail }) => setCreateDesc(detail.value)} placeholder="Optional description" />
          </FormField>
          <FormField label="Key Usage">
            <Select
              selectedOption={createUsage}
              onChange={({ detail }) => setCreateUsage(detail.selectedOption as typeof createUsage)}
              options={KEY_USAGE_OPTIONS}
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteKey !== null}
        onDismiss={() => setDeleteKey(null)}
        header="Schedule key deletion"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteKey(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleScheduleDeletion} loading={schedulingDeletion}>
                Schedule deletion
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>
            Are you sure you want to schedule deletion of key <b>{deleteKey?.KeyId}</b>?
          </Box>
          <FormField label="Pending window (days)">
            <Input value={pendingDays} onChange={({ detail }) => setPendingDays(detail.value)} type="number" />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
