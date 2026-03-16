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
import Select from '@cloudscape-design/components/select';
import Box from '@cloudscape-design/components/box';
import { useCollection } from '@cloudscape-design/collection-hooks';
import {
  GetParametersByPathCommand,
  PutParameterCommand,
  DeleteParameterCommand,
  Parameter,
} from '@aws-sdk/client-ssm';
import { ssm } from '../../api/clients';

const TYPE_OPTIONS = [
  { label: 'String', value: 'String' },
  { label: 'StringList', value: 'StringList' },
  { label: 'SecureString', value: 'SecureString' },
];

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

export default function Parameters() {
  const [params, setParams] = useState<Parameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createValue, setCreateValue] = useState('');
  const [createType, setCreateType] = useState(TYPE_OPTIONS[0]);
  const [creating, setCreating] = useState(false);

  const [editParam, setEditParam] = useState<Parameter | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteParam, setDeleteParam] = useState<Parameter | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ssm.send(new GetParametersByPathCommand({ Path: '/', Recursive: true, WithDecryption: true }));
      setParams(res.Parameters ?? []);
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
      await ssm.send(
        new PutParameterCommand({
          Name: createName,
          Value: createValue,
          Type: createType.value as 'String' | 'StringList' | 'SecureString',
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateValue('');
      setCreateType(TYPE_OPTIONS[0]);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editParam?.Name) return;
    setSaving(true);
    try {
      await ssm.send(
        new PutParameterCommand({
          Name: editParam.Name,
          Value: editValue,
          Type: editParam.Type as 'String' | 'StringList' | 'SecureString',
          Overwrite: true,
        })
      );
      setEditParam(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteParam?.Name) return;
    setDeleting(true);
    try {
      await ssm.send(new DeleteParameterCommand({ Name: deleteParam.Name }));
      setDeleteParam(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(params, {
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
            counter={`(${params.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create parameter
              </Button>
            }
          >
            SSM Parameters
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find parameters" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => (
              <Button
                variant="inline-link"
                onClick={() => {
                  setEditParam(item);
                  setEditValue(item.Value ?? '');
                }}
              >
                {item.Name ?? '-'}
              </Button>
            ),
            sortingField: 'Name',
          },
          {
            id: 'type',
            header: 'Type',
            cell: (item) => item.Type ?? '-',
          },
          {
            id: 'value',
            header: 'Value',
            cell: (item) => item.Value ?? '-',
          },
          {
            id: 'lastModified',
            header: 'Last Modified',
            cell: (item) => formatDate(item.LastModifiedDate),
            sortingField: 'LastModifiedDate',
          },
          {
            id: 'version',
            header: 'Version',
            cell: (item) => item.Version ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteParam(item)}>
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
        header="Create parameter"
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
          <FormField label="Name">
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="/my/parameter" />
          </FormField>
          <FormField label="Type">
            <Select
              selectedOption={createType}
              onChange={({ detail }) => setCreateType(detail.selectedOption as typeof createType)}
              options={TYPE_OPTIONS}
            />
          </FormField>
          <FormField label="Value">
            <Textarea value={createValue} onChange={({ detail }) => setCreateValue(detail.value)} rows={5} />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={editParam !== null}
        onDismiss={() => setEditParam(null)}
        header={`Edit ${editParam?.Name ?? ''}`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setEditParam(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleEdit} loading={saving}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Name">
            <Input value={editParam?.Name ?? ''} disabled />
          </FormField>
          <FormField label="Type">
            <Input value={editParam?.Type ?? ''} disabled />
          </FormField>
          <FormField label="Value">
            <Textarea value={editValue} onChange={({ detail }) => setEditValue(detail.value)} rows={5} />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteParam !== null}
        onDismiss={() => setDeleteParam(null)}
        header="Delete parameter"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteParam(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteParam?.Name}</b>?
      </Modal>
    </SpaceBetween>
  );
}
