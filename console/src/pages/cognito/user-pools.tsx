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
import {
  ListUserPoolsCommand,
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  type UserPoolDescriptionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { cognitoIdp } from '../../api/clients';

export default function UserPools() {
  const navigate = useNavigate();
  const [pools, setPools] = useState<UserPoolDescriptionType[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const [deletePool, setDeletePool] = useState<UserPoolDescriptionType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await cognitoIdp.send(new ListUserPoolsCommand({ MaxResults: 60 }));
      setPools(res.UserPools ?? []);
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
      await cognitoIdp.send(new CreateUserPoolCommand({ PoolName: createName }));
      setShowCreate(false);
      setCreateName('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePool?.Id) return;
    setDeleting(true);
    try {
      await cognitoIdp.send(new DeleteUserPoolCommand({ UserPoolId: deletePool.Id }));
      setDeletePool(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(pools, {
    filtering: {
      filteringFunction: (item, text) => {
        const lower = text.toLowerCase();
        return (
          (item.Name ?? '').toLowerCase().includes(lower) ||
          (item.Id ?? '').toLowerCase().includes(lower)
        );
      },
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
            counter={`(${pools.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create user pool
              </Button>
            }
          >
            Cognito User Pools
          </Header>
        }
        items={items}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Pool Name',
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/cognito/user-pools/${item.Id}`);
                }}
              >
                {item.Name}
              </Link>
            ),
            sortingField: 'Name',
          },
          {
            id: 'id',
            header: 'Pool ID',
            cell: (item) => item.Id ?? '-',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => item.CreationDate?.toLocaleString() ?? '-',
            sortingField: 'CreationDate',
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => item.Status ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeletePool(item)}>
                Delete
              </Button>
            ),
          },
        ]}
        filter={
          <TextFilter {...filterProps} filteringPlaceholder="Find user pools" />
        }
        empty={
          <Box textAlign="center" color="inherit">
            <b>No user pools</b>
          </Box>
        }
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create user pool"
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
        <FormField label="Pool name">
          <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-user-pool" />
        </FormField>
      </Modal>

      <Modal
        visible={deletePool !== null}
        onDismiss={() => setDeletePool(null)}
        header="Delete user pool"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeletePool(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete user pool <b>{deletePool?.Name}</b>?
      </Modal>
    </SpaceBetween>
  );
}
