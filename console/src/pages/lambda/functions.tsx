import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListFunctionsCommand,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import TextFilter from '@cloudscape-design/components/text-filter';
import Link from '@cloudscape-design/components/link';
import Spinner from '@cloudscape-design/components/spinner';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import Box from '@cloudscape-design/components/box';
import { lambda } from '../../api/clients';

const RUNTIME_OPTIONS = [
  { label: 'nodejs22.x', value: 'nodejs22.x' },
  { label: 'nodejs20.x', value: 'nodejs20.x' },
  { label: 'python3.13', value: 'python3.13' },
  { label: 'python3.12', value: 'python3.12' },
];

const EMPTY_ZIP = new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

export default function Functions() {
  const navigate = useNavigate();
  const [functions, setFunctions] = useState<FunctionConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createRuntime, setCreateRuntime] = useState(RUNTIME_OPTIONS[0]);
  const [createHandler, setCreateHandler] = useState('index.handler');
  const [createRole, setCreateRole] = useState('');
  const [createMemory, setCreateMemory] = useState('128');
  const [createTimeout, setCreateTimeout] = useState('3');
  const [creating, setCreating] = useState(false);

  const [deleteFunc, setDeleteFunc] = useState<FunctionConfiguration | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await lambda.send(new ListFunctionsCommand({}));
      setFunctions(res.Functions ?? []);
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
      await lambda.send(
        new CreateFunctionCommand({
          FunctionName: createName,
          Runtime: createRuntime.value as 'nodejs22.x' | 'nodejs20.x' | 'python3.13' | 'python3.12',
          Handler: createHandler,
          Role: createRole,
          MemorySize: Number(createMemory),
          Timeout: Number(createTimeout),
          Code: { ZipFile: EMPTY_ZIP },
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateRuntime(RUNTIME_OPTIONS[0]);
      setCreateHandler('index.handler');
      setCreateRole('');
      setCreateMemory('128');
      setCreateTimeout('3');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteFunc?.FunctionName) return;
    setDeleting(true);
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: deleteFunc.FunctionName }));
      setDeleteFunc(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const filtered = functions.filter(
    (f) => !filterText || f.FunctionName?.toLowerCase().includes(filterText.toLowerCase())
  );

  if (loading) return <Spinner size="large" />;

  return (
    <SpaceBetween size="l">
      <Table
        header={
          <Header
            counter={`(${filtered.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create function
              </Button>
            }
          >
            Functions
          </Header>
        }
        items={filtered}
        filter={
          <TextFilter
            filteringPlaceholder="Find functions"
            filteringText={filterText}
            onChange={({ detail }) => setFilterText(detail.filteringText)}
          />
        }
        columnDefinitions={[
          {
            id: 'name',
            header: 'Function Name',
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/lambda/functions/${item.FunctionName}`);
                }}
              >
                {item.FunctionName}
              </Link>
            ),
            sortingField: 'FunctionName',
          },
          { id: 'runtime', header: 'Runtime', cell: (item) => item.Runtime ?? '-' },
          { id: 'handler', header: 'Handler', cell: (item) => item.Handler ?? '-' },
          { id: 'memory', header: 'Memory (MB)', cell: (item) => item.MemorySize ?? '-' },
          { id: 'timeout', header: 'Timeout (s)', cell: (item) => item.Timeout ?? '-' },
          {
            id: 'lastModified',
            header: 'Last Modified',
            cell: (item) => item.LastModified ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteFunc(item)}>
                Delete
              </Button>
            ),
          },
        ]}
        empty={
          <SpaceBetween size="m" direction="vertical" alignItems="center">
            <b>No functions</b>
          </SpaceBetween>
        }
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create function"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                loading={creating}
                disabled={!createName || !createRole}
              >
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Function name">
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} />
          </FormField>
          <FormField label="Runtime">
            <Select
              selectedOption={createRuntime}
              onChange={({ detail }) => setCreateRuntime(detail.selectedOption as typeof createRuntime)}
              options={RUNTIME_OPTIONS}
            />
          </FormField>
          <FormField label="Handler">
            <Input value={createHandler} onChange={({ detail }) => setCreateHandler(detail.value)} />
          </FormField>
          <FormField label="Role ARN">
            <Input value={createRole} onChange={({ detail }) => setCreateRole(detail.value)} placeholder="arn:aws:iam::123456789012:role/my-role" />
          </FormField>
          <FormField label="Memory (MB)">
            <Input value={createMemory} onChange={({ detail }) => setCreateMemory(detail.value)} type="number" />
          </FormField>
          <FormField label="Timeout (seconds)">
            <Input value={createTimeout} onChange={({ detail }) => setCreateTimeout(detail.value)} type="number" />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteFunc !== null}
        onDismiss={() => setDeleteFunc(null)}
        header="Delete function"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteFunc(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteFunc?.FunctionName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
