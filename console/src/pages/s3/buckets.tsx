import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import TextFilter from '@cloudscape-design/components/text-filter';
import Link from '@cloudscape-design/components/link';
import Spinner from '@cloudscape-design/components/spinner';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { ListBucketsCommand, CreateBucketCommand, DeleteBucketCommand, type Bucket } from '@aws-sdk/client-s3';
import { s3 } from '../../api/clients';

export default function Buckets() {
  const navigate = useNavigate();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteBucket, setDeleteBucket] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await s3.send(new ListBucketsCommand({}));
      setBuckets(res.Buckets ?? []);
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
      await s3.send(new CreateBucketCommand({ Bucket: createName }));
      setShowCreate(false);
      setCreateName('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteBucket) return;
    setDeleting(true);
    try {
      await s3.send(new DeleteBucketCommand({ Bucket: deleteBucket }));
      setDeleteBucket(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(buckets, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.Name ?? '').toLowerCase().includes(text.toLowerCase()),
    },
    sorting: {},
  });

  if (loading) return <Spinner size="large" />;

  return (
    <SpaceBetween size="l">
      <Table
        {...collectionProps}
        header={
          <Header
            counter={`(${buckets.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create bucket
              </Button>
            }
          >
            S3 Buckets
          </Header>
        }
        items={items}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Bucket Name',
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/s3/buckets/${item.Name}`);
                }}
              >
                {item.Name}
              </Link>
            ),
            sortingField: 'Name',
          },
          {
            id: 'created',
            header: 'Creation Date',
            cell: (item) => item.CreationDate?.toLocaleString() ?? '-',
            sortingField: 'CreationDate',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteBucket(item.Name!)}>
                Delete
              </Button>
            ),
          },
        ]}
        filter={
          <TextFilter {...filterProps} filteringPlaceholder="Find buckets" />
        }
        empty={
          <Box textAlign="center" color="inherit">
            <b>No buckets</b>
          </Box>
        }
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create bucket"
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
        <FormField label="Bucket name">
          <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-bucket" />
        </FormField>
      </Modal>

      <Modal
        visible={deleteBucket !== null}
        onDismiss={() => setDeleteBucket(null)}
        header="Delete bucket"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteBucket(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteBucket}</b>?
      </Modal>
    </SpaceBetween>
  );
}
