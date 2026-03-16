import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import TextFilter from '@cloudscape-design/components/text-filter';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Spinner from '@cloudscape-design/components/spinner';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Link from '@cloudscape-design/components/link';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Textarea from '@cloudscape-design/components/textarea';
import Box from '@cloudscape-design/components/box';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { ListRulesCommand, PutRuleCommand, DeleteRuleCommand, Rule } from '@aws-sdk/client-eventbridge';
import { eventbridge } from '../../api/clients';

export default function Rules() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSchedule, setCreateSchedule] = useState('');
  const [createEventPattern, setCreateEventPattern] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await eventbridge.send(new ListRulesCommand({}));
      setRules(res.Rules ?? []);
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
      await eventbridge.send(
        new PutRuleCommand({
          Name: createName,
          Description: createDescription || undefined,
          ScheduleExpression: createSchedule || undefined,
          EventPattern: createEventPattern || undefined,
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreateSchedule('');
      setCreateEventPattern('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRule?.Name) return;
    setDeleting(true);
    try {
      await eventbridge.send(new DeleteRuleCommand({ Name: deleteRule.Name }));
      setDeleteRule(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useCollection(rules, {
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
            counter={`(${rules.length})`}
            actions={
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                Create rule
              </Button>
            }
          >
            EventBridge Rules
          </Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find rules" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Rule Name',
            cell: (item) => (
              <Link onFollow={(e) => { e.preventDefault(); navigate(`/eventbridge/rules/${item.Name}`); }}>
                {item.Name ?? '-'}
              </Link>
            ),
            sortingField: 'Name',
          },
          {
            id: 'state',
            header: 'State',
            cell: (item) => (
              <StatusIndicator type={item.State === 'ENABLED' ? 'success' : 'stopped'}>
                {item.State}
              </StatusIndicator>
            ),
            sortingField: 'State',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'schedule',
            header: 'Schedule / Event Pattern',
            cell: (item) => item.ScheduleExpression ?? (item.EventPattern ? 'Event pattern' : '-'),
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
        items={items}
        variant="full-page"
        stickyHeader
      />

      <Modal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create rule"
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
            <Input value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-rule" />
          </FormField>
          <FormField label="Description">
            <Input value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} />
          </FormField>
          <FormField label="Schedule Expression">
            <Input value={createSchedule} onChange={({ detail }) => setCreateSchedule(detail.value)} placeholder="rate(1 hour)" />
          </FormField>
          <FormField label="Event Pattern" description="Optional JSON event pattern">
            <Textarea value={createEventPattern} onChange={({ detail }) => setCreateEventPattern(detail.value)} rows={5} />
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
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteRule?.Name}</b>?
      </Modal>
    </SpaceBetween>
  );
}
