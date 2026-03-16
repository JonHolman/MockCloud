import { useState, useEffect, useCallback } from 'react';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import TextFilter from '@cloudscape-design/components/text-filter';
import Spinner from '@cloudscape-design/components/spinner';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Textarea from '@cloudscape-design/components/textarea';
import Box from '@cloudscape-design/components/box';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import { useCollection } from '@cloudscape-design/collection-hooks';
import {
  ListSecretsCommand,
  GetSecretValueCommand,
  CreateSecretCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  SecretListEntry,
} from '@aws-sdk/client-secrets-manager';
import { secretsmanager } from '../../api/clients';

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

function SecretValue({ secretId }: { secretId: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function loadValue() {
    if (value !== null) return;
    setLoading(true);
    try {
      const res = await secretsmanager.send(new GetSecretValueCommand({ SecretId: secretId }));
      setValue(res.SecretString ?? '(binary)');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ExpandableSection
      headerText="Secret value"
      expanded={expanded}
      onChange={({ detail }) => {
        setExpanded(detail.expanded);
        if (detail.expanded) loadValue();
      }}
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <Box color="text-status-error">{error}</Box>
      ) : (
        <Box variant="code">{value}</Box>
      )}
    </ExpandableSection>
  );
}

export default function Secrets() {
  const [secrets, setSecrets] = useState<SecretListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createValue, setCreateValue] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [editSecret, setEditSecret] = useState<SecretListEntry | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteSecret, setDeleteSecret] = useState<SecretListEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await secretsmanager.send(new ListSecretsCommand({}));
      setSecrets(res.SecretList ?? []);
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
      await secretsmanager.send(
        new CreateSecretCommand({
          Name: createName,
          SecretString: createValue,
          ...(createDescription && { Description: createDescription }),
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateValue('');
      setCreateDescription('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const openEdit = async (secret: SecretListEntry) => {
    setEditSecret(secret);
    setEditValue('');
    setEditLoading(true);
    try {
      const res = await secretsmanager.send(new GetSecretValueCommand({ SecretId: secret.Name }));
      setEditValue(res.SecretString ?? '');
    } catch (err) {
      setError(String(err));
      setEditSecret(null);
    } finally {
      setEditLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editSecret?.Name) return;
    setSaving(true);
    try {
      await secretsmanager.send(
        new PutSecretValueCommand({
          SecretId: editSecret.Name,
          SecretString: editValue,
        })
      );
      setEditSecret(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteSecret?.Name) return;
    setDeleting(true);
    try {
      await secretsmanager.send(
        new DeleteSecretCommand({
          SecretId: deleteSecret.Name,
          ForceDeleteWithoutRecovery: true,
        })
      );
      setDeleteSecret(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(secrets, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.Name ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${secrets.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create secret
              </Button>
            }
          >
            Secrets Manager Secrets
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find secrets" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Secret Name',
            cell: (item) => item.Name ?? '-',
            sortingField: 'Name',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.ARN ?? '-',
          },
          {
            id: 'lastChanged',
            header: 'Last Changed',
            cell: (item) => formatDate(item.LastChangedDate),
            sortingField: 'LastChangedDate',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'value',
            header: 'Secret Value',
            cell: (item) => <SecretValue secretId={item.Name!} />,
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="inline-link" onClick={() => openEdit(item)}>
                  Edit
                </Button>
                <Button variant="inline-link" onClick={() => setDeleteSecret(item)}>
                  Delete
                </Button>
              </SpaceBetween>
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
        header="Create secret"
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
        <SpaceBetween size="m">
          <FormField label="Secret name">
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-secret" />
          </FormField>
          <FormField label="Secret value">
            <Textarea value={createValue} onChange={({ detail }) => setCreateValue(detail.value)} rows={5} />
          </FormField>
          <FormField label="Description" description="Optional">
            <Input value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={editSecret !== null}
        onDismiss={() => setEditSecret(null)}
        header={`Edit ${editSecret?.Name ?? ''}`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setEditSecret(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleEdit} loading={saving} disabled={editLoading}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {editLoading ? (
          <Spinner />
        ) : (
          <FormField label="Secret value">
            <Textarea value={editValue} onChange={({ detail }) => setEditValue(detail.value)} rows={5} />
          </FormField>
        )}
      </Modal>

      <Modal
        visible={deleteSecret !== null}
        onDismiss={() => setDeleteSecret(null)}
        header="Delete secret"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteSecret(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to permanently delete <b>{deleteSecret?.Name}</b>? This action cannot be undone.
      </Modal>
    </SpaceBetween>
  );
}
