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
import Checkbox from '@cloudscape-design/components/checkbox';
import Toggle from '@cloudscape-design/components/toggle';
import Flashbar from '@cloudscape-design/components/flashbar';
import {
  DescribeUserPoolCommand,
  ListUsersCommand,
  ListUserPoolClientsCommand,
  DescribeUserPoolDomainCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  DeleteUserPoolCommand,
  CreateUserPoolClientCommand,
  DeleteUserPoolClientCommand,
  type UserType,
  type UserPoolClientDescription,
  type UserPoolType,
} from '@aws-sdk/client-cognito-identity-provider';
import { cognitoIdp } from '../../api/clients';

export default function UserPoolDetail() {
  const { userPoolId } = useParams<{ userPoolId: string }>();
  const navigate = useNavigate();
  const [pool, setPool] = useState<UserPoolType | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [clients, setClients] = useState<UserPoolClientDescription[]>([]);
  const [domain, setDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteUser, setDeleteUser] = useState<UserType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [passwordUser, setPasswordUser] = useState<UserType | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [settingPassword, setSettingPassword] = useState(false);

  const [showDeletePool, setShowDeletePool] = useState(false);
  const [deletingPool, setDeletingPool] = useState(false);

  const [showCreateClient, setShowCreateClient] = useState(false);
  const [createClientName, setCreateClientName] = useState('');
  const [generateSecret, setGenerateSecret] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);

  const [deleteClient, setDeleteClient] = useState<UserPoolClientDescription | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await cognitoIdp.send(new ListUsersCommand({ UserPoolId: userPoolId }));
    setUsers(res.Users ?? []);
  }, [userPoolId]);

  const loadClients = useCallback(async () => {
    const res = await cognitoIdp.send(new ListUserPoolClientsCommand({ UserPoolId: userPoolId, MaxResults: 60 }));
    setClients(res.UserPoolClients ?? []);
  }, [userPoolId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [poolRes, usersRes, clientsRes] = await Promise.all([
          cognitoIdp.send(new DescribeUserPoolCommand({ UserPoolId: userPoolId })),
          cognitoIdp.send(new ListUsersCommand({ UserPoolId: userPoolId })),
          cognitoIdp.send(new ListUserPoolClientsCommand({ UserPoolId: userPoolId, MaxResults: 60 })),
        ]);

        if (cancelled) return;

        const userPool = poolRes.UserPool ?? null;
        setPool(userPool);
        setUsers(usersRes.Users ?? []);
        setClients(clientsRes.UserPoolClients ?? []);

        if (userPool?.Domain) {
          try {
            const domainRes = await cognitoIdp.send(
              new DescribeUserPoolDomainCommand({ Domain: userPool.Domain })
            );
            if (!cancelled) {
              setDomain(domainRes.DomainDescription?.Domain ?? null);
            }
          } catch {
            if (!cancelled) setDomain(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userPoolId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await cognitoIdp.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: createUsername,
          TemporaryPassword: createPassword,
        })
      );
      setShowCreate(false);
      setCreateUsername('');
      setCreatePassword('');
      await loadUsers();
      setFlash([{ type: 'success', content: `User "${createUsername}" created.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser?.Username) return;
    setDeleting(true);
    try {
      await cognitoIdp.send(
        new AdminDeleteUserCommand({
          UserPoolId: userPoolId,
          Username: deleteUser.Username,
        })
      );
      setDeleteUser(null);
      await loadUsers();
      setFlash([{ type: 'success', content: `User "${deleteUser.Username}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeleting(false);
    }
  };

  const handleSetPassword = async () => {
    if (!passwordUser?.Username) return;
    setSettingPassword(true);
    try {
      await cognitoIdp.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: passwordUser.Username,
          Password: newPassword,
          Permanent: permanent,
        })
      );
      setPasswordUser(null);
      setNewPassword('');
      setPermanent(true);
      setFlash([{ type: 'success', content: `Password set for "${passwordUser.Username}".` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setSettingPassword(false);
    }
  };

  const handleDeletePool = async () => {
    setDeletingPool(true);
    try {
      await cognitoIdp.send(new DeleteUserPoolCommand({ UserPoolId: userPoolId }));
      navigate('/cognito');
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingPool(false);
      setShowDeletePool(false);
    }
  };

  const handleCreateClient = async () => {
    setCreatingClient(true);
    try {
      await cognitoIdp.send(
        new CreateUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientName: createClientName,
          GenerateSecret: generateSecret,
        })
      );
      setShowCreateClient(false);
      setCreateClientName('');
      setGenerateSecret(false);
      await loadClients();
      setFlash([{ type: 'success', content: `App client "${createClientName}" created.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setCreatingClient(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!deleteClient?.ClientId) return;
    setDeletingClient(true);
    try {
      await cognitoIdp.send(
        new DeleteUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: deleteClient.ClientId,
        })
      );
      setDeleteClient(null);
      await loadClients();
      setFlash([{ type: 'success', content: `App client "${deleteClient.ClientName ?? deleteClient.ClientId}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingClient(false);
    }
  };

  if (loading) return <Spinner size="large" />;
  if (error) return <Header variant="h1">Error: {error}</Header>;

  const poolName = pool?.Name ?? userPoolId!;

  function getUserEmail(user: UserType): string {
    return user.Attributes?.find((a) => a.Name === 'email')?.Value ?? '-';
  }

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
          { text: 'Cognito', href: '/cognito' },
          { text: 'User Pools', href: '/cognito' },
          { text: poolName, href: '#' },
        ]}
        onFollow={(e) => {
          e.preventDefault();
          if (e.detail.href !== '#') navigate(e.detail.href);
        }}
      />

      <Header
        variant="h1"
        actions={
          <Button onClick={() => setShowDeletePool(true)}>Delete pool</Button>
        }
      >
        {poolName}
      </Header>

      <Tabs
        tabs={[
          {
            id: 'users',
            label: 'Users',
            content: (
              <Table
                header={
                  <Header
                    counter={`(${users.length})`}
                    actions={
                      <Button variant="primary" onClick={() => setShowCreate(true)}>
                        Create user
                      </Button>
                    }
                  >
                    Users
                  </Header>
                }
                items={users}
                columnDefinitions={[
                  {
                    id: 'username',
                    header: 'Username',
                    cell: (item) => item.Username ?? '-',
                  },
                  {
                    id: 'email',
                    header: 'Email',
                    cell: (item) => getUserEmail(item),
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    cell: (item) => item.UserStatus ?? '-',
                  },
                  {
                    id: 'created',
                    header: 'Created',
                    cell: (item) => item.UserCreateDate?.toLocaleString() ?? '-',
                  },
                  {
                    id: 'actions',
                    header: 'Actions',
                    cell: (item) => (
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button variant="inline-link" onClick={() => { setPasswordUser(item); setNewPassword(''); setPermanent(true); }}>
                          Set password
                        </Button>
                        <Button variant="inline-link" onClick={() => setDeleteUser(item)}>
                          Delete
                        </Button>
                      </SpaceBetween>
                    ),
                  },
                ]}
                empty={
                  <Box textAlign="center" color="inherit">
                    <b>No users</b>
                  </Box>
                }
              />
            ),
          },
          {
            id: 'clients',
            label: 'App Clients',
            content: (
              <Table
                header={
                  <Header
                    counter={`(${clients.length})`}
                    actions={
                      <Button variant="primary" onClick={() => setShowCreateClient(true)}>
                        Create app client
                      </Button>
                    }
                  >
                    App Clients
                  </Header>
                }
                items={clients}
                columnDefinitions={[
                  {
                    id: 'name',
                    header: 'Client Name',
                    cell: (item) => item.ClientName ?? '-',
                  },
                  {
                    id: 'id',
                    header: 'Client ID',
                    cell: (item) => item.ClientId ?? '-',
                  },
                  {
                    id: 'actions',
                    header: 'Actions',
                    cell: (item) => (
                      <Button variant="inline-link" onClick={() => setDeleteClient(item)}>
                        Delete
                      </Button>
                    ),
                  },
                ]}
                empty={
                  <Box textAlign="center" color="inherit">
                    <b>No app clients</b>
                  </Box>
                }
              />
            ),
          },
          {
            id: 'domain',
            label: 'Domain',
            content: (
              <Box padding="l">
                {domain ? (
                  <SpaceBetween size="s">
                    <Box variant="h3">Domain</Box>
                    <Box>{domain}</Box>
                  </SpaceBetween>
                ) : (
                  <Box color="text-body-secondary">No domain configured</Box>
                )}
              </Box>
            ),
          },
        ]}
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create user"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} loading={creating} disabled={!createUsername}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Username">
            <Input value={createUsername} onChange={({ detail }) => setCreateUsername(detail.value)} placeholder="username" />
          </FormField>
          <FormField label="Temporary password">
            <Input type="password" value={createPassword} onChange={({ detail }) => setCreatePassword(detail.value)} />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteUser !== null}
        onDismiss={() => setDeleteUser(null)}
        header="Delete user"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteUser(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete user <b>{deleteUser?.Username}</b>?
      </Modal>

      <Modal
        visible={passwordUser !== null}
        onDismiss={() => setPasswordUser(null)}
        header={`Set password for ${passwordUser?.Username ?? ''}`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setPasswordUser(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSetPassword} loading={settingPassword} disabled={!newPassword}>
                Set password
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Password">
            <Input type="password" value={newPassword} onChange={({ detail }) => setNewPassword(detail.value)} />
          </FormField>
          <Checkbox checked={permanent} onChange={({ detail }) => setPermanent(detail.checked)}>
            Permanent
          </Checkbox>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={showCreateClient}
        onDismiss={() => setShowCreateClient(false)}
        header="Create app client"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreateClient(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateClient} loading={creatingClient} disabled={!createClientName}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Client name">
            <Input value={createClientName} onChange={({ detail }) => setCreateClientName(detail.value)} placeholder="my-app-client" />
          </FormField>
          <Toggle checked={generateSecret} onChange={({ detail }) => setGenerateSecret(detail.checked)}>
            Generate client secret
          </Toggle>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteClient !== null}
        onDismiss={() => setDeleteClient(null)}
        header="Delete app client"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteClient(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteClient} loading={deletingClient}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete app client <b>{deleteClient?.ClientName ?? deleteClient?.ClientId}</b>?
      </Modal>

      <Modal
        visible={showDeletePool}
        onDismiss={() => setShowDeletePool(false)}
        header="Delete user pool"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDeletePool(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeletePool} loading={deletingPool}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete user pool <b>{poolName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
