import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@cloudscape-design/components/header';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Container from '@cloudscape-design/components/container';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Textarea from '@cloudscape-design/components/textarea';
import Spinner from '@cloudscape-design/components/spinner';
import Flashbar from '@cloudscape-design/components/flashbar';
import {
  DescribeRuleCommand,
  DescribeRuleCommandOutput,
  ListTargetsByRuleCommand,
  EnableRuleCommand,
  DisableRuleCommand,
  DeleteRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  Target,
} from '@aws-sdk/client-eventbridge';
import { eventbridge } from '../../api/clients';

export default function RuleDetail() {
  const { ruleName } = useParams<{ ruleName: string }>();
  const navigate = useNavigate();
  const [rule, setRule] = useState<DescribeRuleCommandOutput | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [showAddTarget, setShowAddTarget] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [targetArn, setTargetArn] = useState('');
  const [addingTarget, setAddingTarget] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<Target | null>(null);
  const [removingTarget, setRemovingTarget] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editSchedule, setEditSchedule] = useState('');
  const [editPattern, setEditPattern] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ruleRes, targetsRes] = await Promise.all([
        eventbridge.send(new DescribeRuleCommand({ Name: ruleName })),
        eventbridge.send(new ListTargetsByRuleCommand({ Rule: ruleName })),
      ]);
      setRule(ruleRes);
      setTargets(targetsRes.Targets ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [ruleName]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    if (!rule) return;
    setToggling(true);
    try {
      if (rule.State === 'ENABLED') {
        await eventbridge.send(new DisableRuleCommand({ Name: ruleName }));
      } else {
        await eventbridge.send(new EnableRuleCommand({ Name: ruleName }));
      }
      await load();
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await eventbridge.send(new DeleteRuleCommand({ Name: ruleName }));
      navigate('/eventbridge');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = () => {
    if (!rule) return;
    setEditDescription(rule.Description ?? '');
    setEditSchedule(rule.ScheduleExpression ?? '');
    setEditPattern(rule.EventPattern ?? '');
    setShowEdit(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await eventbridge.send(
        new PutRuleCommand({
          Name: ruleName,
          Description: editDescription || undefined,
          ScheduleExpression: editSchedule || undefined,
          EventPattern: editPattern || undefined,
        })
      );
      setShowEdit(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleAddTarget = async () => {
    setAddingTarget(true);
    try {
      await eventbridge.send(
        new PutTargetsCommand({
          Rule: ruleName,
          Targets: [{ Id: targetId, Arn: targetArn }],
        })
      );
      setShowAddTarget(false);
      setTargetId('');
      setTargetArn('');
      await load();
      setFlash([{ type: 'success', content: `Target "${targetId}" added.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAddingTarget(false);
    }
  };

  const handleRemoveTarget = async () => {
    if (!removeTarget?.Id) return;
    setRemovingTarget(true);
    try {
      await eventbridge.send(
        new RemoveTargetsCommand({
          Rule: ruleName,
          Ids: [removeTarget.Id],
        })
      );
      setRemoveTarget(null);
      await load();
      setFlash([{ type: 'success', content: `Target "${removeTarget.Id}" removed.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setRemovingTarget(false);
    }
  };

  if (loading) return <Spinner size="large" />;
  if (error) return <Header variant="h1">Error: {error}</Header>;
  if (!rule) return <Header variant="h1">Rule not found</Header>;

  let formattedPattern = '-';
  if (rule.EventPattern) {
    try {
      formattedPattern = JSON.stringify(JSON.parse(rule.EventPattern), null, 2);
    } catch {
      formattedPattern = rule.EventPattern;
    }
  }

  const isEnabled = rule.State === 'ENABLED';

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
          { text: 'EventBridge', href: '/eventbridge' },
          { text: 'Rules', href: '/eventbridge' },
          { text: ruleName!, href: '#' },
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
            <Button onClick={openEdit}>Edit</Button>
            <Button onClick={handleToggle} loading={toggling}>
              {isEnabled ? 'Disable' : 'Enable'}
            </Button>
            <Button onClick={() => setShowDelete(true)}>Delete</Button>
          </SpaceBetween>
        }
      >
        {ruleName}
      </Header>
      <Container header={<Header variant="h2">Rule details</Header>}>
        <KeyValuePairs
          columns={2}
          items={[
            { label: 'Name', value: rule.Name ?? '-' },
            { label: 'ARN', value: rule.Arn ?? '-' },
            {
              label: 'State',
              value: (
                <StatusIndicator type={isEnabled ? 'success' : 'stopped'}>
                  {rule.State}
                </StatusIndicator>
              ),
            },
            { label: 'Description', value: rule.Description || '-' },
            { label: 'Schedule Expression', value: rule.ScheduleExpression || '-' },
            { label: 'Event Bus', value: rule.EventBusName ?? '-' },
          ]}
        />
      </Container>
      {rule.EventPattern && (
        <Container header={<Header variant="h2">Event pattern</Header>}>
          <pre style={{ background: '#1a1a2e', color: '#e0e0e0', padding: '16px', borderRadius: '8px', overflow: 'auto', fontSize: '13px', margin: 0 }}>
            {formattedPattern}
          </pre>
        </Container>
      )}
      <Table
        header={
          <Header
            counter={`(${targets.length})`}
            actions={<Button onClick={() => setShowAddTarget(true)}>Add target</Button>}
          >
            Targets
          </Header>
        }
        items={targets}
        columnDefinitions={[
          {
            id: 'targetId',
            header: 'Target ID',
            cell: (item) => item.Id ?? '-',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.Arn ?? '-',
          },
          {
            id: 'input',
            header: 'Input',
            cell: (item) => item.Input ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setRemoveTarget(item)}>
                Remove
              </Button>
            ),
          },
        ]}
        empty={
          <Box textAlign="center" color="inherit">
            <b>No targets</b>
          </Box>
        }
      />

      <Modal
        visible={showEdit}
        onDismiss={() => setShowEdit(false)}
        header="Edit rule"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowEdit(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveEdit} loading={saving}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Description">
            <Input value={editDescription} onChange={({ detail }) => setEditDescription(detail.value)} placeholder="Rule description" />
          </FormField>
          <FormField label="Schedule Expression">
            <Input value={editSchedule} onChange={({ detail }) => setEditSchedule(detail.value)} placeholder="rate(1 hour)" />
          </FormField>
          <FormField label="Event Pattern">
            <Textarea value={editPattern} onChange={({ detail }) => setEditPattern(detail.value)} placeholder='{"source": ["aws.ec2"]}' rows={8} />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={showAddTarget}
        onDismiss={() => setShowAddTarget(false)}
        header="Add target"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowAddTarget(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAddTarget} loading={addingTarget} disabled={!targetId || !targetArn}>
                Add
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Target ID">
            <Input value={targetId} onChange={({ detail }) => setTargetId(detail.value)} placeholder="my-target" />
          </FormField>
          <FormField label="Target ARN">
            <Input value={targetArn} onChange={({ detail }) => setTargetArn(detail.value)} placeholder="arn:aws:lambda:us-east-1:123456789012:function:my-function" />
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={removeTarget !== null}
        onDismiss={() => setRemoveTarget(null)}
        header="Remove target"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setRemoveTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleRemoveTarget} loading={removingTarget}>
                Remove
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to remove target <b>{removeTarget?.Id}</b>?
      </Modal>

      <Modal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Delete rule"
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
        Are you sure you want to delete <b>{ruleName}</b>? This will navigate back to the rules list.
      </Modal>
    </SpaceBetween>
  );
}
