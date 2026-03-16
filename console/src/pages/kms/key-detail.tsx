import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@cloudscape-design/components/header';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Container from '@cloudscape-design/components/container';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Spinner from '@cloudscape-design/components/spinner';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Box from '@cloudscape-design/components/box';
import Table from '@cloudscape-design/components/table';
import Flashbar from '@cloudscape-design/components/flashbar';
import {
  DescribeKeyCommand,
  EnableKeyCommand,
  DisableKeyCommand,
  ScheduleKeyDeletionCommand,
  ListAliasesCommand,
  CreateAliasCommand,
  DeleteAliasCommand,
  UpdateKeyDescriptionCommand,
  KeyMetadata,
  AliasListEntry,
} from '@aws-sdk/client-kms';
import { kms } from '../../api/clients';

function statusType(state: string | undefined): 'success' | 'error' | 'warning' | 'info' {
  if (state === 'Enabled') return 'success';
  if (state === 'Disabled') return 'error';
  if (state === 'PendingDeletion') return 'warning';
  return 'info';
}

export default function KeyDetail() {
  const { keyId } = useParams<{ keyId: string }>();
  const navigate = useNavigate();
  const [key, setKey] = useState<KeyMetadata | null>(null);
  const [aliases, setAliases] = useState<AliasListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [pendingDays, setPendingDays] = useState('7');
  const [schedulingDeletion, setSchedulingDeletion] = useState(false);

  const [showCreateAlias, setShowCreateAlias] = useState(false);
  const [aliasName, setAliasName] = useState('');
  const [creatingAlias, setCreatingAlias] = useState(false);

  const [deleteAlias, setDeleteAlias] = useState<AliasListEntry | null>(null);
  const [deletingAlias, setDeletingAlias] = useState(false);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [showEditDesc, setShowEditDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  const load = useCallback(async () => {
    try {
      const [descRes, aliasRes] = await Promise.all([
        kms.send(new DescribeKeyCommand({ KeyId: keyId })),
        kms.send(new ListAliasesCommand({ KeyId: keyId })),
      ]);
      setKey(descRes.KeyMetadata ?? null);
      setAliases(aliasRes.Aliases ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [keyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    if (!key?.KeyId) return;
    setToggling(true);
    try {
      if (key.KeyState === 'Enabled') {
        await kms.send(new DisableKeyCommand({ KeyId: key.KeyId }));
      } else {
        await kms.send(new EnableKeyCommand({ KeyId: key.KeyId }));
      }
      await load();
    } finally {
      setToggling(false);
    }
  };

  const handleScheduleDeletion = async () => {
    if (!key?.KeyId) return;
    setSchedulingDeletion(true);
    try {
      await kms.send(
        new ScheduleKeyDeletionCommand({
          KeyId: key.KeyId,
          PendingWindowInDays: parseInt(pendingDays, 10) || 7,
        })
      );
      navigate('/kms');
    } finally {
      setSchedulingDeletion(false);
    }
  };

  const handleCreateAlias = async () => {
    if (!key?.KeyId || !aliasName) return;
    setCreatingAlias(true);
    try {
      const fullName = aliasName.startsWith('alias/') ? aliasName : `alias/${aliasName}`;
      await kms.send(new CreateAliasCommand({ AliasName: fullName, TargetKeyId: key.KeyId }));
      setShowCreateAlias(false);
      setAliasName('');
      await load();
    } finally {
      setCreatingAlias(false);
    }
  };

  const handleDeleteAlias = async () => {
    if (!deleteAlias?.AliasName) return;
    setDeletingAlias(true);
    try {
      await kms.send(new DeleteAliasCommand({ AliasName: deleteAlias.AliasName }));
      setDeleteAlias(null);
      await load();
      setFlash([{ type: 'success', content: `Alias "${deleteAlias.AliasName}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingAlias(false);
    }
  };

  const handleEditDescription = async () => {
    if (!key?.KeyId) return;
    setSavingDesc(true);
    try {
      await kms.send(new UpdateKeyDescriptionCommand({ KeyId: key.KeyId, Description: descDraft }));
      setShowEditDesc(false);
      await load();
    } finally {
      setSavingDesc(false);
    }
  };

  if (loading) return <Spinner size="large" />;
  if (error) return <Header variant="h1">Error: {error}</Header>;
  if (!key) return <Header variant="h1">Key not found</Header>;

  const canToggle = key.KeyState === 'Enabled' || key.KeyState === 'Disabled';
  const canDelete = key.KeyState !== 'PendingDeletion';

  return (
    <SpaceBetween size="l">
      {flash.length > 0 && (
        <Flashbar
          items={flash.map((f, i) => ({
            type: f.type,
            content: f.content,
            dismissible: true,
            id: String(i),
            onDismiss: () => setFlash([]),
          }))}
        />
      )}
      <BreadcrumbGroup
        items={[
          { text: 'NAWS', href: '/' },
          { text: 'KMS', href: '/kms' },
          { text: 'Keys', href: '/kms' },
          { text: keyId!, href: '#' },
        ]}
        onFollow={(e) => {
          e.preventDefault();
          if (e.detail.href !== '#') navigate(e.detail.href);
        }}
      />
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => { setDescDraft(key.Description ?? ''); setShowEditDesc(true); }}>
              Edit description
            </Button>
            {canToggle && (
              <Button onClick={handleToggle} loading={toggling}>
                {key.KeyState === 'Enabled' ? 'Disable key' : 'Enable key'}
              </Button>
            )}
            {canDelete && (
              <Button onClick={() => setShowDelete(true)}>Schedule deletion</Button>
            )}
          </SpaceBetween>
        }
      >
        {keyId}
      </Header>
      <Container header={<Header variant="h2">Key details</Header>}>
        <KeyValuePairs
          columns={2}
          items={[
            { label: 'Key ID', value: key.KeyId ?? '-' },
            { label: 'ARN', value: key.Arn ?? '-' },
            { label: 'Description', value: key.Description || '-' },
            {
              label: 'Status',
              value: (
                <StatusIndicator type={statusType(key.KeyState)}>
                  {key.KeyState}
                </StatusIndicator>
              ),
            },
            { label: 'Key Usage', value: key.KeyUsage ?? '-' },
            { label: 'Key Spec', value: key.KeySpec ?? '-' },
            { label: 'Created', value: key.CreationDate?.toLocaleString() ?? '-' },
            { label: 'Enabled', value: key.Enabled ? 'Yes' : 'No' },
          ]}
        />
      </Container>
      <Table
        header={
          <Header
            counter={`(${aliases.length})`}
            actions={
              <Button onClick={() => setShowCreateAlias(true)}>Create alias</Button>
            }
          >
            Aliases
          </Header>
        }
        items={aliases}
        columnDefinitions={[
          { id: 'name', header: 'Alias Name', cell: (item) => item.AliasName ?? '-' },
          { id: 'arn', header: 'Alias ARN', cell: (item) => item.AliasArn ?? '-' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteAlias(item)}>
                Delete
              </Button>
            ),
          },
        ]}
        empty={
          <Box textAlign="center" color="inherit">
            <b>No aliases</b>
          </Box>
        }
      />

      <Modal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Schedule key deletion"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDelete(false)}>
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
            Are you sure you want to schedule deletion of key <b>{key.KeyId}</b>?
          </Box>
          <FormField label="Pending window (days)">
            <Input value={pendingDays} onChange={({ detail }) => setPendingDays(detail.value)} type="number" />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={showCreateAlias}
        onDismiss={() => setShowCreateAlias(false)}
        header="Create alias"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreateAlias(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateAlias} loading={creatingAlias} disabled={!aliasName}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Alias name" description="Will be prefixed with alias/ if not already">
          <Input value={aliasName} onChange={({ detail }) => setAliasName(detail.value)} placeholder="my-key-alias" />
        </FormField>
      </Modal>

      <Modal
        visible={showEditDesc}
        onDismiss={() => setShowEditDesc(false)}
        header="Edit description"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowEditDesc(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleEditDescription} loading={savingDesc}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Description">
          <Input
            value={descDraft}
            onChange={({ detail }) => setDescDraft(detail.value)}
            placeholder="Key description"
          />
        </FormField>
      </Modal>

      <Modal
        visible={deleteAlias !== null}
        onDismiss={() => setDeleteAlias(null)}
        header="Delete alias"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteAlias(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteAlias} loading={deletingAlias}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete alias <b>{deleteAlias?.AliasName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
