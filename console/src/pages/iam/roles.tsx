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
import Textarea from '@cloudscape-design/components/textarea';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { ListRolesCommand, CreateRoleCommand, DeleteRoleCommand, type Role } from '@aws-sdk/client-iam';
import { iam } from '../../api/clients';

const DEFAULT_ASSUME_ROLE_POLICY = JSON.stringify(
  {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: 'lambda.amazonaws.com' },
        Action: 'sts:AssumeRole',
      },
    ],
  },
  null,
  2
);

export default function Roles() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPolicy, setCreatePolicy] = useState(DEFAULT_ASSUME_ROLE_POLICY);
  const [creating, setCreating] = useState(false);

  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await iam.send(new ListRolesCommand({}));
    setRoles(res.Roles ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await iam.send(
        new CreateRoleCommand({
          RoleName: createName,
          Description: createDescription || undefined,
          AssumeRolePolicyDocument: createPolicy,
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreatePolicy(DEFAULT_ASSUME_ROLE_POLICY);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRole?.RoleName) return;
    setDeleting(true);
    try {
      await iam.send(new DeleteRoleCommand({ RoleName: deleteRole.RoleName }));
      setDeleteRole(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(roles, {
    filtering: {
      filteringFunction: (item, text) => {
        const lower = text.toLowerCase();
        return (
          (item.RoleName ?? '').toLowerCase().includes(lower) ||
          (item.Arn ?? '').toLowerCase().includes(lower) ||
          (item.Description ?? '').toLowerCase().includes(lower)
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
            counter={`(${roles.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create role
              </Button>
            }
          >
            IAM Roles
          </Header>
        }
        items={items}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Role Name',
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/iam/roles/${item.RoleName}`);
                }}
              >
                {item.RoleName}
              </Link>
            ),
            sortingField: 'RoleName',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.Arn ?? '-',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => item.CreateDate?.toLocaleString() ?? '-',
            sortingField: 'CreateDate',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteRole(item)}>
                Delete
              </Button>
            ),
          },
        ]}
        filter={
          <TextFilter {...filterProps} filteringPlaceholder="Find roles" />
        }
        empty={
          <Box textAlign="center" color="inherit">
            <b>No roles</b>
          </Box>
        }
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create role"
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
          <FormField label="Role name">
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} />
          </FormField>
          <FormField label="Description">
            <Input value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} />
          </FormField>
          <FormField label="Assume Role Policy Document">
            <Textarea value={createPolicy} onChange={({ detail }) => setCreatePolicy(detail.value)} rows={10} />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteRole !== null}
        onDismiss={() => setDeleteRole(null)}
        header="Delete role"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteRole(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteRole?.RoleName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
