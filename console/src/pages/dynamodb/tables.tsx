import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListTablesCommand,
  DescribeTableCommand,
  CreateTableCommand,
  DeleteTableCommand,
  TableDescription,
} from '@aws-sdk/client-dynamodb';
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
import { dynamodb } from '../../api/clients';

const KEY_TYPE_OPTIONS = [
  { label: 'String (S)', value: 'S' },
  { label: 'Number (N)', value: 'N' },
  { label: 'Binary (B)', value: 'B' },
];

export default function Tables() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createTableName, setCreateTableName] = useState('');
  const [pkName, setPkName] = useState('pk');
  const [pkType, setPkType] = useState(KEY_TYPE_OPTIONS[0]);
  const [skName, setSkName] = useState('');
  const [skType, setSkType] = useState(KEY_TYPE_OPTIONS[0]);
  const [creating, setCreating] = useState(false);

  const [deleteTable, setDeleteTable] = useState<TableDescription | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const listRes = await dynamodb.send(new ListTablesCommand({}));
      const names = listRes.TableNames ?? [];
      const descriptions = await Promise.all(
        names.map((name) =>
          dynamodb
            .send(new DescribeTableCommand({ TableName: name }))
            .then((r) => r.Table!)
        )
      );
      setTables(descriptions);
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
      const keySchema: { AttributeName: string; KeyType: 'HASH' | 'RANGE' }[] = [{ AttributeName: pkName, KeyType: 'HASH' }];
      const attributeDefinitions: { AttributeName: string; AttributeType: 'S' | 'N' | 'B' }[] = [{ AttributeName: pkName, AttributeType: pkType.value as 'S' | 'N' | 'B' }];
      if (skName) {
        keySchema.push({ AttributeName: skName, KeyType: 'RANGE' });
        attributeDefinitions.push({ AttributeName: skName, AttributeType: skType.value as 'S' | 'N' | 'B' });
      }
      await dynamodb.send(
        new CreateTableCommand({
          TableName: createTableName,
          KeySchema: keySchema,
          AttributeDefinitions: attributeDefinitions,
          BillingMode: 'PAY_PER_REQUEST',
        })
      );
      setShowCreate(false);
      setCreateTableName('');
      setPkName('pk');
      setPkType(KEY_TYPE_OPTIONS[0]);
      setSkName('');
      setSkType(KEY_TYPE_OPTIONS[0]);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTable?.TableName) return;
    setDeleting(true);
    try {
      await dynamodb.send(new DeleteTableCommand({ TableName: deleteTable.TableName }));
      setDeleteTable(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const getKey = (table: TableDescription, type: 'HASH' | 'RANGE') => {
    const ks = table.KeySchema?.find((k) => k.KeyType === type);
    if (!ks) return '-';
    const attr = table.AttributeDefinitions?.find((a) => a.AttributeName === ks.AttributeName);
    return `${ks.AttributeName} (${attr?.AttributeType ?? '?'})`;
  };

  const filtered = tables.filter(
    (t) => !filterText || t.TableName?.toLowerCase().includes(filterText.toLowerCase())
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
                Create table
              </Button>
            }
          >
            Tables
          </Header>
        }
        items={filtered}
        filter={
          <TextFilter
            filteringPlaceholder="Find tables"
            filteringText={filterText}
            onChange={({ detail }) => setFilterText(detail.filteringText)}
          />
        }
        columnDefinitions={[
          {
            id: 'name',
            header: 'Table Name',
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/dynamodb/tables/${item.TableName}`);
                }}
              >
                {item.TableName}
              </Link>
            ),
            sortingField: 'TableName',
          },
          { id: 'status', header: 'Status', cell: (item) => item.TableStatus ?? '-' },
          { id: 'pk', header: 'Partition Key', cell: (item) => getKey(item, 'HASH') },
          { id: 'sk', header: 'Sort Key', cell: (item) => getKey(item, 'RANGE') },
          { id: 'itemCount', header: 'Item Count', cell: (item) => item.ItemCount ?? 0 },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteTable(item)}>
                Delete
              </Button>
            ),
          },
        ]}
        empty={
          <SpaceBetween size="m" direction="vertical" alignItems="center">
            <b>No tables</b>
          </SpaceBetween>
        }
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create table"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} loading={creating} disabled={!createTableName || !pkName}>
                Create
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Table name">
            <Input value={createTableName} onChange={({ detail }) => setCreateTableName(detail.value)} placeholder="my-table" />
          </FormField>
          <FormField label="Partition key name">
            <Input value={pkName} onChange={({ detail }) => setPkName(detail.value)} placeholder="pk" />
          </FormField>
          <FormField label="Partition key type">
            <Select
              selectedOption={pkType}
              onChange={({ detail }) => setPkType(detail.selectedOption as typeof pkType)}
              options={KEY_TYPE_OPTIONS}
            />
          </FormField>
          <FormField label="Sort key name (optional)">
            <Input value={skName} onChange={({ detail }) => setSkName(detail.value)} placeholder="" />
          </FormField>
          {skName && (
            <FormField label="Sort key type">
              <Select
                selectedOption={skType}
                onChange={({ detail }) => setSkType(detail.selectedOption as typeof skType)}
                options={KEY_TYPE_OPTIONS}
              />
            </FormField>
          )}
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteTable !== null}
        onDismiss={() => setDeleteTable(null)}
        header="Delete table"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteTable(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteTable?.TableName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
