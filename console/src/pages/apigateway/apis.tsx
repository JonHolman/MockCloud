import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import TextFilter from '@cloudscape-design/components/text-filter';
import Link from '@cloudscape-design/components/link';
import Spinner from '@cloudscape-design/components/spinner';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Box from '@cloudscape-design/components/box';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { GetRestApisCommand, CreateRestApiCommand, DeleteRestApiCommand, RestApi } from '@aws-sdk/client-api-gateway';
import { apigateway } from '../../api/clients';

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

export default function Apis() {
  const navigate = useNavigate();
  const [apis, setApis] = useState<RestApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteApi, setDeleteApi] = useState<RestApi | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apigateway.send(new GetRestApisCommand({}));
      setApis(res.items ?? []);
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
      await apigateway.send(new CreateRestApiCommand({ name: createName, description: createDescription }));
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteApi?.id) return;
    setDeleting(true);
    try {
      await apigateway.send(new DeleteRestApiCommand({ restApiId: deleteApi.id }));
      setDeleteApi(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(apis, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.name ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${apis.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create API
              </Button>
            }
          >
            API Gateway APIs
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find APIs" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'API Name',
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/apigateway/apis/${encodeURIComponent(item.id!)}`);
                }}
              >
                {item.name}
              </Link>
            ),
            sortingField: 'name',
          },
          {
            id: 'id',
            header: 'API ID',
            cell: (item) => item.id ?? '-',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.description ?? '-',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => formatDate(item.createdDate),
            sortingField: 'createdDate',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteApi(item)}>
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
        header="Create API"
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
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="My REST API" />
          </FormField>
          <FormField label="Description">
            <Input value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteApi !== null}
        onDismiss={() => setDeleteApi(null)}
        header="Delete API"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteApi(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteApi?.name}</b>?
      </Modal>
    </SpaceBetween>
  );
}
