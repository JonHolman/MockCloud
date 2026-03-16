import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@cloudscape-design/components/header';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tabs from '@cloudscape-design/components/tabs';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Spinner from '@cloudscape-design/components/spinner';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Textarea from '@cloudscape-design/components/textarea';
import Flashbar from '@cloudscape-design/components/flashbar';
import {
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  DeleteRoleCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand,
  UpdateAssumeRolePolicyCommand,
  PutRolePolicyCommand,
  GetRolePolicyCommand,
  DeleteRolePolicyCommand,
  type AttachedPolicy,
  type Role,
} from '@aws-sdk/client-iam';
import { iam } from '../../api/clients';

export default function RoleDetail() {
  const { roleName } = useParams<{ roleName: string }>();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [attachedPolicies, setAttachedPolicies] = useState<AttachedPolicy[]>([]);
  const [inlinePolicies, setInlinePolicies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [showDeleteRole, setShowDeleteRole] = useState(false);
  const [deletingRole, setDeletingRole] = useState(false);

  const [showAttach, setShowAttach] = useState(false);
  const [attachArn, setAttachArn] = useState('');
  const [attaching, setAttaching] = useState(false);

  const [detachPolicy, setDetachPolicy] = useState<AttachedPolicy | null>(null);
  const [detaching, setDetaching] = useState(false);

  const [showEditTrust, setShowEditTrust] = useState(false);
  const [trustPolicyDraft, setTrustPolicyDraft] = useState('');
  const [savingTrust, setSavingTrust] = useState(false);

  const [showCreateInline, setShowCreateInline] = useState(false);
  const [inlinePolicyName, setInlinePolicyName] = useState('');
  const [inlinePolicyDoc, setInlinePolicyDoc] = useState('{"Version":"2012-10-17","Statement":[]}');
  const [creatingInline, setCreatingInline] = useState(false);

  const [viewInlinePolicy, setViewInlinePolicy] = useState<string | null>(null);
  const [viewInlinePolicyDoc, setViewInlinePolicyDoc] = useState('');
  const [loadingInlinePolicy, setLoadingInlinePolicy] = useState(false);
  const [savingInlinePolicy, setSavingInlinePolicy] = useState(false);

  const [deleteInlinePolicy, setDeleteInlinePolicy] = useState<string | null>(null);
  const [deletingInlinePolicy, setDeletingInlinePolicy] = useState(false);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const load = useCallback(async () => {
    const [roleRes, attachedRes, inlineRes] = await Promise.all([
      iam.send(new GetRoleCommand({ RoleName: roleName })),
      iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName })),
      iam.send(new ListRolePoliciesCommand({ RoleName: roleName })),
    ]);
    setRole(roleRes.Role ?? null);
    setAttachedPolicies(attachedRes.AttachedPolicies ?? []);
    setInlinePolicies(inlineRes.PolicyNames ?? []);
    setLoading(false);
  }, [roleName]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteRole = async () => {
    setDeletingRole(true);
    try {
      await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
      navigate('/iam');
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingRole(false);
    }
  };

  const handleAttach = async () => {
    setAttaching(true);
    try {
      await iam.send(
        new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: attachArn })
      );
      setShowAttach(false);
      setAttachArn('');
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAttaching(false);
    }
  };

  const handleDetach = async () => {
    if (!detachPolicy?.PolicyArn) return;
    setDetaching(true);
    try {
      await iam.send(
        new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: detachPolicy.PolicyArn })
      );
      setDetachPolicy(null);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDetaching(false);
    }
  };

  const handleEditTrust = async () => {
    setSavingTrust(true);
    try {
      await iam.send(
        new UpdateAssumeRolePolicyCommand({ RoleName: roleName, PolicyDocument: trustPolicyDraft })
      );
      setShowEditTrust(false);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setSavingTrust(false);
    }
  };

  const handleCreateInline = async () => {
    setCreatingInline(true);
    try {
      await iam.send(
        new PutRolePolicyCommand({ RoleName: roleName, PolicyName: inlinePolicyName, PolicyDocument: inlinePolicyDoc })
      );
      setShowCreateInline(false);
      setInlinePolicyName('');
      setInlinePolicyDoc('{"Version":"2012-10-17","Statement":[]}');
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setCreatingInline(false);
    }
  };

  const handleViewInlinePolicy = async (policyName: string) => {
    setViewInlinePolicy(policyName);
    setLoadingInlinePolicy(true);
    try {
      const res = await iam.send(
        new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName })
      );
      setViewInlinePolicyDoc(JSON.stringify(JSON.parse(decodeURIComponent(res.PolicyDocument!)), null, 2));
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setLoadingInlinePolicy(false);
    }
  };

  const handleSaveInlinePolicy = async () => {
    setSavingInlinePolicy(true);
    try {
      await iam.send(
        new PutRolePolicyCommand({ RoleName: roleName, PolicyName: viewInlinePolicy!, PolicyDocument: viewInlinePolicyDoc })
      );
      setViewInlinePolicy(null);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setSavingInlinePolicy(false);
    }
  };

  const handleDeleteInlinePolicy = async () => {
    setDeletingInlinePolicy(true);
    try {
      await iam.send(
        new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: deleteInlinePolicy! })
      );
      setDeleteInlinePolicy(null);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingInlinePolicy(false);
    }
  };

  if (loading) return <Spinner size="large" />;

  const trustPolicy = role?.AssumeRolePolicyDocument
    ? JSON.stringify(JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument)), null, 2)
    : '{}';

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
          { text: 'IAM', href: '/iam' },
          { text: 'Roles', href: '/iam' },
          { text: roleName!, href: '#' },
        ]}
        onFollow={(e) => {
          e.preventDefault();
          if (e.detail.href !== '#') navigate(e.detail.href);
        }}
      />

      <Header
        variant="h1"
        actions={
          <Button onClick={() => setShowDeleteRole(true)}>Delete</Button>
        }
      >
        {roleName}
      </Header>

      <Tabs
        tabs={[
          {
            id: 'trust',
            label: 'Trust Policy',
            content: (
              <SpaceBetween size="m">
                <Box float="right">
                  <Button onClick={() => { setTrustPolicyDraft(trustPolicy); setShowEditTrust(true); }}>
                    Edit trust policy
                  </Button>
                </Box>
                <Box padding="l">
                  <pre style={{ background: '#1a1a2e', color: '#e0e0e0', padding: '16px', borderRadius: '8px', overflow: 'auto', fontSize: '13px' }}>
                    {trustPolicy}
                  </pre>
                </Box>
              </SpaceBetween>
            ),
          },
          {
            id: 'permissions',
            label: 'Permissions',
            content: (
              <SpaceBetween size="l">
                <Table
                  header={
                    <Header
                      counter={`(${attachedPolicies.length})`}
                      actions={
                        <Button onClick={() => setShowAttach(true)}>Attach policy</Button>
                      }
                    >
                      Attached Policies
                    </Header>
                  }
                  items={attachedPolicies}
                  columnDefinitions={[
                    {
                      id: 'name',
                      header: 'Policy Name',
                      cell: (item) => item.PolicyName ?? '-',
                    },
                    {
                      id: 'arn',
                      header: 'Policy ARN',
                      cell: (item) => item.PolicyArn ?? '-',
                    },
                    {
                      id: 'actions',
                      header: 'Actions',
                      cell: (item) => (
                        <Button variant="inline-link" onClick={() => setDetachPolicy(item)}>
                          Detach
                        </Button>
                      ),
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No attached policies</b>
                    </Box>
                  }
                />
                <Table
                  header={
                    <Header
                      counter={`(${inlinePolicies.length})`}
                      actions={
                        <Button onClick={() => setShowCreateInline(true)}>Create inline policy</Button>
                      }
                    >
                      Inline Policies
                    </Header>
                  }
                  items={inlinePolicies.map((name) => ({ name }))}
                  columnDefinitions={[
                    {
                      id: 'name',
                      header: 'Policy Name',
                      cell: (item) => (
                        <Button variant="inline-link" onClick={() => handleViewInlinePolicy(item.name)}>
                          {item.name}
                        </Button>
                      ),
                    },
                    {
                      id: 'actions',
                      header: 'Actions',
                      cell: (item) => (
                        <Button variant="inline-link" onClick={() => setDeleteInlinePolicy(item.name)}>
                          Delete
                        </Button>
                      ),
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No inline policies</b>
                    </Box>
                  }
                />
              </SpaceBetween>
            ),
          },
        ]}
      />

      <Modal
        visible={showDeleteRole}
        onDismiss={() => setShowDeleteRole(false)}
        header="Delete role"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDeleteRole(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteRole} loading={deletingRole}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{roleName}</b>?
      </Modal>

      <Modal
        visible={showAttach}
        onDismiss={() => setShowAttach(false)}
        header="Attach policy"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowAttach(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAttach} loading={attaching} disabled={!attachArn}>
                Attach
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Policy ARN">
          <Input
            value={attachArn}
            onChange={({ detail }) => setAttachArn(detail.value)}
            placeholder="arn:aws:iam::aws:policy/..."
          />
        </FormField>
      </Modal>

      <Modal
        visible={detachPolicy !== null}
        onDismiss={() => setDetachPolicy(null)}
        header="Detach policy"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDetachPolicy(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDetach} loading={detaching}>
                Detach
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to detach <b>{detachPolicy?.PolicyName}</b>?
      </Modal>

      <Modal
        visible={showEditTrust}
        onDismiss={() => setShowEditTrust(false)}
        header="Edit trust policy"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowEditTrust(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleEditTrust} loading={savingTrust}>
                Update
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Trust policy document">
          <Textarea
            value={trustPolicyDraft}
            onChange={({ detail }) => setTrustPolicyDraft(detail.value)}
            rows={16}
          />
        </FormField>
      </Modal>

      <Modal
        visible={showCreateInline}
        onDismiss={() => setShowCreateInline(false)}
        header="Create inline policy"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreateInline(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateInline} loading={creatingInline} disabled={!inlinePolicyName}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Policy name">
            <Input
              value={inlinePolicyName}
              onChange={({ detail }) => setInlinePolicyName(detail.value)}
            />
          </FormField>
          <FormField label="Policy document">
            <Textarea
              value={inlinePolicyDoc}
              onChange={({ detail }) => setInlinePolicyDoc(detail.value)}
              rows={16}
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={viewInlinePolicy !== null}
        onDismiss={() => setViewInlinePolicy(null)}
        header={viewInlinePolicy}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setViewInlinePolicy(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveInlinePolicy} loading={savingInlinePolicy} disabled={loadingInlinePolicy}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {loadingInlinePolicy ? <Spinner /> : (
          <FormField label="Policy document">
            <Textarea
              value={viewInlinePolicyDoc}
              onChange={({ detail }) => setViewInlinePolicyDoc(detail.value)}
              rows={16}
            />
          </FormField>
        )}
      </Modal>

      <Modal
        visible={deleteInlinePolicy !== null}
        onDismiss={() => setDeleteInlinePolicy(null)}
        header="Delete inline policy"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteInlinePolicy(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteInlinePolicy} loading={deletingInlinePolicy}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteInlinePolicy}</b>?
      </Modal>
    </SpaceBetween>
  );
}
