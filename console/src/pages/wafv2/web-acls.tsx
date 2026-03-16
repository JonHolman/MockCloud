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
import Box from '@cloudscape-design/components/box';
import { useCollection } from '@cloudscape-design/collection-hooks';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import {
  ListWebACLsCommand,
  GetWebACLCommand,
  DeleteWebACLCommand,
  CreateWebACLCommand,
  WebACLSummary,
} from '@aws-sdk/client-wafv2';
import { wafv2 } from '../../api/clients';

export default function WebAcls() {
  const navigate = useNavigate();
  const [acls, setAcls] = useState<WebACLSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteAcl, setDeleteAcl] = useState<WebACLSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createScope, setCreateScope] = useState<{ label: string; value: string }>({ label: 'REGIONAL', value: 'REGIONAL' });
  const [createAction, setCreateAction] = useState<{ label: string; value: string }>({ label: 'Allow', value: 'Allow' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await wafv2.send(new ListWebACLsCommand({ Scope: 'REGIONAL' }));
      setAcls(res.WebACLs ?? []);
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
      const defaultAction = createAction.value === 'Allow' ? { Allow: {} } : { Block: {} };
      await wafv2.send(
        new CreateWebACLCommand({
          Name: createName,
          Scope: createScope.value as 'REGIONAL' | 'CLOUDFRONT',
          DefaultAction: defaultAction,
          VisibilityConfig: {
            SampledRequestsEnabled: true,
            CloudWatchMetricsEnabled: true,
            MetricName: createName,
          },
          Rules: [],
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateScope({ label: 'REGIONAL', value: 'REGIONAL' });
      setCreateAction({ label: 'Allow', value: 'Allow' });
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteAcl?.Id || !deleteAcl?.Name) return;
    setDeleting(true);
    try {
      const getRes = await wafv2.send(
        new GetWebACLCommand({ Name: deleteAcl.Name, Id: deleteAcl.Id, Scope: 'REGIONAL' })
      );
      await wafv2.send(
        new DeleteWebACLCommand({
          Name: deleteAcl.Name,
          Id: deleteAcl.Id,
          Scope: 'REGIONAL',
          LockToken: getRes.LockToken,
        })
      );
      setDeleteAcl(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(acls, {
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
            counter={`(${acls.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create Web ACL
              </Button>
            }
          >
            WAFv2 Web ACLs
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find Web ACLs" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => (
              <Link onFollow={(e) => { e.preventDefault(); navigate(`/wafv2/web-acls/${item.Name}/${item.Id}`); }}>
                {item.Name ?? '-'}
              </Link>
            ),
            sortingField: 'Name',
          },
          {
            id: 'id',
            header: 'ID',
            cell: (item) => item.Id ?? '-',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.ARN ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteAcl(item)}>
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
        header="Create Web ACL"
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
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-web-acl" />
          </FormField>
          <FormField label="Scope">
            <Select
              selectedOption={createScope}
              onChange={({ detail }) => setCreateScope(detail.selectedOption as typeof createScope)}
              options={[
                { label: 'REGIONAL', value: 'REGIONAL' },
                { label: 'CLOUDFRONT', value: 'CLOUDFRONT' },
              ]}
            />
          </FormField>
          <FormField label="Default Action">
            <Select
              selectedOption={createAction}
              onChange={({ detail }) => setCreateAction(detail.selectedOption as typeof createAction)}
              options={[
                { label: 'Allow', value: 'Allow' },
                { label: 'Block', value: 'Block' },
              ]}
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteAcl !== null}
        onDismiss={() => setDeleteAcl(null)}
        header="Delete Web ACL"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteAcl(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete Web ACL <b>{deleteAcl?.Name}</b>?
      </Modal>
    </SpaceBetween>
  );
}
