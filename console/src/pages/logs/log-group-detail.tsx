import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@cloudscape-design/components/header';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Spinner from '@cloudscape-design/components/spinner';
import Modal from '@cloudscape-design/components/modal';
import Input from '@cloudscape-design/components/input';
import {
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  DeleteLogGroupCommand,
  DeleteLogStreamCommand,
  LogStream,
  OutputLogEvent,
} from '@aws-sdk/client-cloudwatch-logs';
import { logs } from '../../api/clients';

function formatDate(epoch: number | undefined): string {
  if (!epoch) return '-';
  return new Date(epoch).toLocaleString();
}

function formatTimestamp(epoch: number | undefined): string {
  if (!epoch) return '';
  const d = new Date(epoch);
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function LogGroupDetail() {
  const params = useParams();
  const rawName = params['*'] ?? '';
  const logGroupName = rawName.startsWith('/') ? rawName : '/' + rawName;
  const navigate = useNavigate();
  const [streams, setStreams] = useState<LogStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [events, setEvents] = useState<OutputLogEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState('');

  const [showDeleteGroup, setShowDeleteGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const [deleteStream, setDeleteStream] = useState<LogStream | null>(null);
  const [deletingStream, setDeletingStream] = useState(false);

  const loadStreams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await logs.send(
        new DescribeLogStreamsCommand({
          logGroupName,
          orderBy: 'LastEventTime',
          descending: true,
        }),
      );
      const sorted = (res.logStreams ?? []).sort(
        (a, b) => (b.lastEventTimestamp ?? 0) - (a.lastEventTimestamp ?? 0),
      );
      setStreams(sorted);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [logGroupName]);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);

  const loadEvents = useCallback(
    async (streamName: string) => {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const res = await logs.send(
          new GetLogEventsCommand({
            logGroupName,
            logStreamName: streamName,
            startFromHead: true,
          }),
        );
        setEvents(res.events ?? []);
      } catch (err) {
        setEventsError(String(err));
      } finally {
        setEventsLoading(false);
      }
    },
    [logGroupName],
  );

  useEffect(() => {
    if (selectedStream) {
      loadEvents(selectedStream);
    }
  }, [selectedStream, loadEvents]);

  const handleDeleteGroup = async () => {
    setDeletingGroup(true);
    try {
      await logs.send(new DeleteLogGroupCommand({ logGroupName }));
      navigate('/logs');
    } finally {
      setDeletingGroup(false);
    }
  };

  const handleDeleteStream = async () => {
    if (!deleteStream?.logStreamName) return;
    setDeletingStream(true);
    try {
      await logs.send(
        new DeleteLogStreamCommand({
          logGroupName,
          logStreamName: deleteStream.logStreamName,
        }),
      );
      setDeleteStream(null);
      if (selectedStream === deleteStream.logStreamName) {
        setSelectedStream(null);
        setEvents([]);
      }
      await loadStreams();
    } finally {
      setDeletingStream(false);
    }
  };

  const filteredEvents = eventFilter
    ? events.filter((e) => (e.message ?? '').toLowerCase().includes(eventFilter.toLowerCase()))
    : events;

  if (loading) return <Spinner size="large" />;
  if (error) return <Header variant="h1">Error: {error}</Header>;

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: 'NAWS', href: '/' },
          { text: 'CloudWatch Logs', href: '/logs' },
          { text: 'Log Groups', href: '/logs' },
          { text: logGroupName, href: '#' },
        ]}
        onFollow={(e) => {
          e.preventDefault();
          if (e.detail.href !== '#') navigate(e.detail.href);
        }}
      />
      <Header
        variant="h1"
        actions={
          <Button onClick={() => setShowDeleteGroup(true)}>Delete log group</Button>
        }
      >
        {logGroupName}
      </Header>
      <Table
        header={
          <Header
            counter={`(${streams.length})`}
            actions={
              <Button variant="icon" iconName="refresh" onClick={loadStreams} />
            }
          >
            Log Streams
          </Header>
        }
        items={streams}
        selectionType="single"
        selectedItems={streams.filter((s) => s.logStreamName === selectedStream)}
        onSelectionChange={({ detail }) => {
          const name = detail.selectedItems[0]?.logStreamName ?? null;
          setSelectedStream(name);
          if (!name) setEvents([]);
        }}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Stream Name',
            cell: (item) => item.logStreamName ?? '-',
            sortingField: 'logStreamName',
          },
          {
            id: 'lastEvent',
            header: 'Last Event Time',
            cell: (item) => formatDate(item.lastEventTimestamp),
            sortingField: 'lastEventTimestamp',
          },
          {
            id: 'firstEvent',
            header: 'First Event Time',
            cell: (item) => formatDate(item.firstEventTimestamp),
            sortingField: 'firstEventTimestamp',
          },
          {
            id: 'storedBytes',
            header: 'Stored Bytes',
            cell: (item) => formatBytes(item.storedBytes),
            sortingField: 'storedBytes',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button variant="inline-link" onClick={() => setDeleteStream(item)}>
                Delete
              </Button>
            ),
          },
        ]}
        empty={
          <Box textAlign="center" color="inherit">
            <b>No log streams</b>
          </Box>
        }
      />
      {selectedStream && (
        <SpaceBetween size="s">
          <Header
            variant="h2"
            actions={
              <Button
                variant="icon"
                iconName="refresh"
                onClick={() => loadEvents(selectedStream)}
              />
            }
          >
            {selectedStream}
          </Header>
          <Input
            value={eventFilter}
            onChange={({ detail }) => setEventFilter(detail.value)}
            placeholder="Filter log events..."
            type="search"
          />
          {eventsLoading ? (
            <Spinner size="large" />
          ) : eventsError ? (
            <Box color="text-status-error">{eventsError}</Box>
          ) : filteredEvents.length === 0 ? (
            <Box textAlign="center" color="inherit">
              <b>{eventFilter ? 'No matching log events' : 'No log events'}</b>
            </Box>
          ) : (
            <div
              style={{
                background: '#1a1a2e',
                color: '#e0e0e0',
                padding: '12px 16px',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '600px',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: '1.5',
              }}
            >
              {filteredEvents.map((event, i) => (
                <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  <span style={{ color: '#888' }}>{formatTimestamp(event.timestamp)}</span>
                  {'  '}
                  {event.message}
                </div>
              ))}
            </div>
          )}
        </SpaceBetween>
      )}

      <Modal
        visible={showDeleteGroup}
        onDismiss={() => setShowDeleteGroup(false)}
        header="Delete log group"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDeleteGroup(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteGroup} loading={deletingGroup}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{logGroupName}</b>?
      </Modal>

      <Modal
        visible={deleteStream !== null}
        onDismiss={() => setDeleteStream(null)}
        header="Delete log stream"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteStream(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteStream} loading={deletingStream}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete stream <b>{deleteStream?.logStreamName}</b>?
      </Modal>
    </SpaceBetween>
  );
}
