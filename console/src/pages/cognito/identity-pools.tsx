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
import Checkbox from '@cloudscape-design/components/checkbox';
import { useCollection } from '@cloudscape-design/collection-hooks';
import {
  ListIdentityPoolsCommand,
  CreateIdentityPoolCommand,
  DeleteIdentityPoolCommand,
} from '@aws-sdk/client-cognito-identity';
import { cognitoIdentity } from '../../api/clients';

interface IdentityPoolEntry {
  IdentityPoolId: string;
  IdentityPoolName: string;
}

export default function IdentityPools() {
  const navigate = useNavigate();
  const [pools, setPools] = useState<IdentityPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [allowUnauth, setAllowUnauth] = useState(false);
  const [creating, setCreating] = useState(false);

  const [deletePool, setDeletePool] = useState<IdentityPoolEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await cognitoIdentity.send(new ListIdentityPoolsCommand({ MaxResults: 60 }));
      setPools((res.IdentityPools ?? []) as IdentityPoolEntry[]);
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
      await cognitoIdentity.send(new CreateIdentityPoolCommand({
        IdentityPoolName: createName,
        AllowUnauthenticatedIdentities: allowUnauth,
      }));
      setShowCreate(false);
      setCreateName('');
      setAllowUnauth(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePool?.IdentityPoolId) return;
    setDeleting(true);
    try {
      await cognitoIdentity.send(new DeleteIdentityPoolCommand({ IdentityPoolId: deletePool.IdentityPoolId }));
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
          (item.IdentityPoolName ?? '').toLowerCase().includes(lower) ||
          (item.IdentityPoolId ?? '').toLowerCase().includes(lower)
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
                Create identity pool
              </Button>
            }
          >
            Cognito Identity Pools
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
                  navigate(`/cognito/identity-pools/${item.IdentityPoolId}`);
                }}
              >
                {item.IdentityPoolName}
              </Link>
            ),
            sortingField: 'IdentityPoolName',
          },
          {
            id: 'id',
            header: 'Pool ID',
            cell: (item) => item.IdentityPoolId ?? '-',
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
          <TextFilter {...filterProps} filteringPlaceholder="Find identity pools" />
        }
        empty={
          <Box textAlign="center" color="inherit">
            <b>No identity pools</b>
          </Box>
        }
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create identity pool"
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
        <SpaceBetween size="l">
          <FormField label="Identity pool name">
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-identity-pool" />
          </FormField>
          <Checkbox checked={allowUnauth} onChange={({ detail }) => setAllowUnauth(detail.checked)}>
            Allow unauthenticated identities
          </Checkbox>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deletePool !== null}
        onDismiss={() => setDeletePool(null)}
        header="Delete identity pool"
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
        Are you sure you want to delete identity pool <b>{deletePool?.IdentityPoolName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
