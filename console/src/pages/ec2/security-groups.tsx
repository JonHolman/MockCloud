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
import { DescribeSecurityGroupsCommand, CreateSecurityGroupCommand, DeleteSecurityGroupCommand, SecurityGroup } from '@aws-sdk/client-ec2';
import { ec2 } from '../../api/clients';

export default function SecurityGroups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createVpcId, setCreateVpcId] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteGroup, setDeleteGroup] = useState<SecurityGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ec2.send(new DescribeSecurityGroupsCommand({}));
      setGroups(res.SecurityGroups ?? []);
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
      await ec2.send(
        new CreateSecurityGroupCommand({
          GroupName: createName,
          Description: createDescription,
          VpcId: createVpcId || undefined,
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreateVpcId('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteGroup?.GroupId) return;
    setDeleting(true);
    try {
      await ec2.send(new DeleteSecurityGroupCommand({ GroupId: deleteGroup.GroupId }));
      setDeleteGroup(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(groups, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.GroupName ?? '').toLowerCase().includes(text.toLowerCase()) ||
        (item.GroupId ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${groups.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create security group
              </Button>
            }
          >
            Security Groups
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find security groups" />}
        columnDefinitions={[
          {
            id: 'groupId',
            header: 'Group ID',
            cell: (item) => (
              <Link onFollow={(e) => { e.preventDefault(); navigate(`/ec2/security-groups/${item.GroupId}`); }}>
                {item.GroupId ?? '-'}
              </Link>
            ),
            sortingField: 'GroupId',
          },
          {
            id: 'groupName',
            header: 'Group Name',
            cell: (item) => item.GroupName ?? '-',
            sortingField: 'GroupName',
          },
          {
            id: 'vpcId',
            header: 'VPC ID',
            cell: (item) => item.VpcId ?? '-',
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
        header="Create security group"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} loading={creating} disabled={!createName || !createDescription}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Name">
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-security-group" />
          </FormField>
          <FormField label="Description">
            <Input value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} placeholder="Security group description" />
          </FormField>
          <FormField label="VPC ID" description="Optional">
            <Input value={createVpcId} onChange={({ detail }) => setCreateVpcId(detail.value)} placeholder="vpc-xxxxxxxx" />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteGroup !== null}
        onDismiss={() => setDeleteGroup(null)}
        header="Delete security group"
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
        Are you sure you want to delete <b>{deleteGroup?.GroupName}</b> ({deleteGroup?.GroupId})?
      </Modal>
    </SpaceBetween>
  );
}
