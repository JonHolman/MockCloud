import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@cloudscape-design/components/header';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Container from '@cloudscape-design/components/container';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Spinner from '@cloudscape-design/components/spinner';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import Flashbar from '@cloudscape-design/components/flashbar';
import { GetWebACLCommand, DeleteWebACLCommand, UpdateWebACLCommand, WebACL, Rule } from '@aws-sdk/client-wafv2';
import { wafv2 } from '../../api/clients';

function ruleAction(rule: Rule): string {
  if (rule.Action?.Allow) return 'Allow';
  if (rule.Action?.Block) return 'Block';
  if (rule.Action?.Count) return 'Count';
  return '-';
}

export default function WebAclDetail() {
  const { name, id } = useParams<{ name: string; id: string }>();
  const navigate = useNavigate();
  const [acl, setAcl] = useState<WebACL | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showEditAction, setShowEditAction] = useState(false);
  const [editAction, setEditAction] = useState<{ label: string; value: string }>({ label: 'Allow', value: 'Allow' });
  const [savingAction, setSavingAction] = useState(false);

  const [showAddRule, setShowAddRule] = useState(false);
  const [addRuleName, setAddRuleName] = useState('');
  const [addRulePriority, setAddRulePriority] = useState('');
  const [addRuleAction, setAddRuleAction] = useState<{ label: string; value: string }>({ label: 'Allow', value: 'Allow' });
  const [addingRule, setAddingRule] = useState(false);

  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await wafv2.send(new GetWebACLCommand({ Name: name, Id: id, Scope: 'REGIONAL' }));
      setAcl(res.WebACL ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [name, id]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchLockToken = async (): Promise<string | undefined> => {
    const res = await wafv2.send(new GetWebACLCommand({ Name: name, Id: id, Scope: 'REGIONAL' }));
    return res.LockToken;
  };

  const handleEditAction = async () => {
    if (!acl || !id || !name) return;
    setSavingAction(true);
    try {
      const token = await fetchLockToken();
      const defaultAction = editAction.value === 'Allow' ? { Allow: {} } : { Block: {} };
      await wafv2.send(
        new UpdateWebACLCommand({
          Name: name,
          Id: id,
          Scope: 'REGIONAL',
          LockToken: token,
          DefaultAction: defaultAction,
          VisibilityConfig: acl.VisibilityConfig,
          Rules: acl.Rules ?? [],
        })
      );
      setShowEditAction(false);
      setLoading(true);
      await load();
      setFlash([{ type: 'success', content: 'Default action updated.' }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setSavingAction(false);
    }
  };

  const handleAddRule = async () => {
    if (!acl || !id || !name || !addRuleName || !addRulePriority) return;
    setAddingRule(true);
    try {
      const token = await fetchLockToken();
      const newRule: Rule = {
        Name: addRuleName,
        Priority: parseInt(addRulePriority, 10),
        Action: addRuleAction.value === 'Allow' ? { Allow: {} } : { Block: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: addRuleName,
        },
        Statement: {
          ByteMatchStatement: {
            SearchString: new Uint8Array(),
            FieldToMatch: { UriPath: {} },
            TextTransformations: [{ Priority: 0, Type: 'NONE' }],
            PositionalConstraint: 'CONTAINS',
          },
        },
      };
      await wafv2.send(
        new UpdateWebACLCommand({
          Name: name,
          Id: id,
          Scope: 'REGIONAL',
          LockToken: token,
          DefaultAction: acl.DefaultAction,
          VisibilityConfig: acl.VisibilityConfig,
          Rules: [...(acl.Rules ?? []), newRule],
        })
      );
      setShowAddRule(false);
      setAddRuleName('');
      setAddRulePriority('');
      setAddRuleAction({ label: 'Allow', value: 'Allow' });
      setLoading(true);
      await load();
      setFlash([{ type: 'success', content: `Rule "${addRuleName}" added.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!acl || !id || !name || !deleteRule) return;
    setDeletingRule(true);
    try {
      const token = await fetchLockToken();
      const updatedRules = (acl.Rules ?? []).filter((r) => r.Name !== deleteRule.Name);
      await wafv2.send(
        new UpdateWebACLCommand({
          Name: name,
          Id: id,
          Scope: 'REGIONAL',
          LockToken: token,
          DefaultAction: acl.DefaultAction,
          VisibilityConfig: acl.VisibilityConfig,
          Rules: updatedRules,
        })
      );
      setDeleteRule(null);
      setLoading(true);
      await load();
      setFlash([{ type: 'success', content: `Rule "${deleteRule.Name}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingRule(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !name) return;
    setDeleting(true);
    try {
      const token = await fetchLockToken();
      await wafv2.send(
        new DeleteWebACLCommand({ Name: name, Id: id, Scope: 'REGIONAL', LockToken: token })
      );
      navigate('/wafv2');
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Spinner size="large" />;
  if (error) return <Header variant="h1">Error: {error}</Header>;
  if (!acl) return <Header variant="h1">Web ACL not found</Header>;

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
          { text: 'WAFv2', href: '/wafv2' },
          { text: 'Web ACLs', href: '/wafv2' },
          { text: name!, href: '#' },
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
            <Button onClick={() => {
              const current = acl.DefaultAction?.Allow ? 'Allow' : 'Block';
              setEditAction({ label: current, value: current });
              setShowEditAction(true);
            }}>
              Edit default action
            </Button>
            <Button onClick={() => setShowDelete(true)}>Delete</Button>
          </SpaceBetween>
        }
      >
        {acl.Name}
      </Header>
      <Container header={<Header variant="h2">Web ACL details</Header>}>
        <KeyValuePairs
          columns={2}
          items={[
            { label: 'Name', value: acl.Name ?? '-' },
            { label: 'ID', value: acl.Id ?? '-' },
            { label: 'ARN', value: acl.ARN ?? '-' },
            { label: 'Description', value: acl.Description || '-' },
            { label: 'Default Action', value: acl.DefaultAction?.Allow ? 'Allow' : 'Block' },
            { label: 'Capacity', value: String(acl.Capacity ?? '-') },
          ]}
        />
      </Container>
      <Table
        header={
          <Header
            counter={`(${(acl.Rules ?? []).length})`}
            actions={
              <Button onClick={() => setShowAddRule(true)}>Add rule</Button>
            }
          >
            Rules
          </Header>
        }
        items={acl.Rules ?? []}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => item.Name ?? '-',
          },
          {
            id: 'priority',
            header: 'Priority',
            cell: (item) => item.Priority ?? '-',
            sortingField: 'Priority',
          },
          {
            id: 'action',
            header: 'Action',
            cell: (item) => ruleAction(item),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteRule(item)}>
                Delete
              </Button>
            ),
          },
        ]}
        empty={
          <Box textAlign="center" color="inherit">
            <b>No rules</b>
          </Box>
        }
      />

      <Modal
        visible={showAddRule}
        onDismiss={() => setShowAddRule(false)}
        header="Add rule"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowAddRule(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAddRule} loading={addingRule} disabled={!addRuleName || !addRulePriority}>
                Add
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Name">
            <Input value={addRuleName} onChange={({ detail }) => setAddRuleName(detail.value)} placeholder="my-rule" />
          </FormField>
          <FormField label="Priority">
            <Input value={addRulePriority} onChange={({ detail }) => setAddRulePriority(detail.value)} type="number" placeholder="0" />
          </FormField>
          <FormField label="Action">
            <Select
              selectedOption={addRuleAction}
              onChange={({ detail }) => setAddRuleAction(detail.selectedOption as typeof addRuleAction)}
              options={[
                { label: 'Allow', value: 'Allow' },
                { label: 'Block', value: 'Block' },
              ]}
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteRule !== null}
        onDismiss={() => setDeleteRule(null)}
        header="Delete rule"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteRule(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteRule} loading={deletingRule}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete rule <b>{deleteRule?.Name}</b>?
      </Modal>

      <Modal
        visible={showEditAction}
        onDismiss={() => setShowEditAction(false)}
        header="Edit default action"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowEditAction(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleEditAction} loading={savingAction}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Default Action">
          <Select
            selectedOption={editAction}
            onChange={({ detail }) => setEditAction(detail.selectedOption as typeof editAction)}
            options={[
              { label: 'Allow', value: 'Allow' },
              { label: 'Block', value: 'Block' },
            ]}
          />
        </FormField>
      </Modal>

      <Modal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Delete Web ACL"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDelete(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete Web ACL <b>{acl.Name}</b>?
      </Modal>
    </SpaceBetween>
  );
}
