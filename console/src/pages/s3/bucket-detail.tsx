import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Link from '@cloudscape-design/components/link';
import Spinner from '@cloudscape-design/components/spinner';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import ProgressBar from '@cloudscape-design/components/progress-bar';
import {
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
  GetObjectCommand,
  type _Object,
  type CommonPrefix,
} from '@aws-sdk/client-s3';
import { s3 } from '../../api/clients';

interface DisplayItem {
  key: string;
  displayName: string;
  isFolder: boolean;
  size?: number;
  lastModified?: Date;
  storageClass?: string;
}

export default function BucketDetail() {
  const { bucketName } = useParams<{ bucketName: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [prefix, setPrefix] = useState('');
  const [loading, setLoading] = useState(true);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadPrefix, setUploadPrefix] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: '' });

  const [showView, setShowView] = useState(false);
  const [viewKey, setViewKey] = useState('');
  const [viewBody, setViewBody] = useState('');
  const [viewLoading, setViewLoading] = useState(false);

  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showDeleteBucket, setShowDeleteBucket] = useState(false);
  const [deletingBucket, setDeletingBucket] = useState(false);

  const [tableDragOver, setTableDragOver] = useState(false);
  const [dropZoneDragOver, setDropZoneDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableDragCounter = useRef(0);
  const dropZoneDragCounter = useRef(0);

  const load = useCallback(async (currentPrefix: string) => {
    setLoading(true);
    try {
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: currentPrefix || undefined,
          Delimiter: '/',
        })
      );

      const folders: DisplayItem[] = (res.CommonPrefixes ?? []).map((cp: CommonPrefix) => ({
        key: cp.Prefix!,
        displayName: cp.Prefix!.slice(currentPrefix.length),
        isFolder: true,
      }));

      const files: DisplayItem[] = (res.Contents ?? [])
        .filter((obj: _Object) => obj.Key !== currentPrefix)
        .map((obj: _Object) => ({
          key: obj.Key!,
          displayName: obj.Key!.slice(currentPrefix.length),
          isFolder: false,
          size: obj.Size,
          lastModified: obj.LastModified,
          storageClass: obj.StorageClass,
        }));

      setItems([...folders, ...files]);
    } finally {
      setLoading(false);
    }
  }, [bucketName]);

  useEffect(() => {
    load(prefix);
  }, [prefix, load]);

  const openUploadModal = (files?: File[]) => {
    setUploadFiles(files ?? []);
    setUploadPrefix(prefix);
    setUploadProgress({ current: 0, total: 0, fileName: '' });
    setShowUpload(true);
  };

  const closeUploadModal = () => {
    setShowUpload(false);
    setUploadFiles([]);
    setUploadPrefix('');
  };

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setUploadFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...arr.filter((f) => !existing.has(f.name + f.size))];
    });
  };

  const removeFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress({ current: i + 1, total: uploadFiles.length, fileName: file.name });
        const buffer = await file.arrayBuffer();
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: uploadPrefix + file.name,
            Body: new Uint8Array(buffer),
          })
        );
      }
      closeUploadModal();
      await load(prefix);
    } finally {
      setUploading(false);
    }
  };

  const handleTableDragEnter = (e: DragEvent) => {
    e.preventDefault();
    tableDragCounter.current++;
    if (tableDragCounter.current === 1) setTableDragOver(true);
  };

  const handleTableDragLeave = (e: DragEvent) => {
    e.preventDefault();
    tableDragCounter.current--;
    if (tableDragCounter.current === 0) setTableDragOver(false);
  };

  const handleTableDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleTableDrop = (e: DragEvent) => {
    e.preventDefault();
    tableDragCounter.current = 0;
    setTableDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      openUploadModal(Array.from(e.dataTransfer.files));
    }
  };

  const handleDropZoneDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dropZoneDragCounter.current++;
    if (dropZoneDragCounter.current === 1) setDropZoneDragOver(true);
  };

  const handleDropZoneDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dropZoneDragCounter.current--;
    if (dropZoneDragCounter.current === 0) setDropZoneDragOver(false);
  };

  const handleDropZoneDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDropZoneDrop = (e: DragEvent) => {
    e.preventDefault();
    dropZoneDragCounter.current = 0;
    setDropZoneDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = async () => {
    if (!deleteKey) return;
    setDeleting(true);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: deleteKey }));
      setDeleteKey(null);
      await load(prefix);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteBucket = async () => {
    setDeletingBucket(true);
    try {
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
      navigate('/s3');
    } finally {
      setDeletingBucket(false);
    }
  };

  const handleView = async (key: string) => {
    setViewKey(key);
    setViewBody('');
    setShowView(true);
    setViewLoading(true);
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
      const body = await res.Body?.transformToString();
      setViewBody(body ?? '');
    } catch (err) {
      setViewBody(`Error fetching object: ${err}`);
    } finally {
      setViewLoading(false);
    }
  };

  const prefixParts = prefix.split('/').filter(Boolean);

  const breadcrumbItems = [
    { text: 'NAWS', href: '/' },
    { text: 'S3', href: '/s3' },
    { text: 'Buckets', href: '/s3' },
    { text: bucketName!, href: `/s3/buckets/${bucketName}` },
    ...prefixParts.map((part, i) => {
      const href = prefixParts.slice(0, i + 1).join('/') + '/';
      return { text: part, href };
    }),
  ];

  function formatSize(bytes?: number): string {
    if (bytes == null) return '-';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={breadcrumbItems}
        onFollow={(e) => {
          e.preventDefault();
          const href = e.detail.href;
          if (href === '/' || href === '/s3') {
            navigate(href);
          } else if (href === `/s3/buckets/${bucketName}`) {
            setPrefix('');
          } else {
            setPrefix(href);
          }
        }}
      />

      {prefix && (
        <Box variant="p" color="text-body-secondary">
          {bucketName}/{prefix}
        </Box>
      )}

      {loading ? (
        <Spinner size="large" />
      ) : (
        <div
          onDragEnter={handleTableDragEnter}
          onDragLeave={handleTableDragLeave}
          onDragOver={handleTableDragOver}
          onDrop={handleTableDrop}
          style={{
            position: 'relative',
          }}
        >
          {tableDragOver && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0, 122, 243, 0.08)',
                border: '2px dashed #007af3',
                borderRadius: '8px',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <Box fontSize="heading-m" color="text-status-info" fontWeight="bold">
                Drop files to upload
              </Box>
            </div>
          )}
          <Table
            header={
              <Header
                counter={`(${items.length})`}
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button onClick={() => setShowDeleteBucket(true)}>
                      Delete bucket
                    </Button>
                    <Button variant="primary" onClick={() => openUploadModal()}>
                      Upload
                    </Button>
                  </SpaceBetween>
                }
              >
                Objects
              </Header>
            }
            items={items}
            columnDefinitions={[
              {
                id: 'name',
                header: 'Key',
                cell: (item) =>
                  item.isFolder ? (
                    <Link
                      onFollow={(e) => {
                        e.preventDefault();
                        setPrefix(item.key);
                      }}
                    >
                      {item.displayName}
                    </Link>
                  ) : (
                    <Link
                      onFollow={(e) => {
                        e.preventDefault();
                        handleView(item.key);
                      }}
                    >
                      {item.displayName}
                    </Link>
                  ),
              },
              {
                id: 'size',
                header: 'Size',
                cell: (item) => (item.isFolder ? '-' : formatSize(item.size)),
              },
              {
                id: 'lastModified',
                header: 'Last Modified',
                cell: (item) => item.lastModified?.toLocaleString() ?? '-',
              },
              {
                id: 'storageClass',
                header: 'Storage Class',
                cell: (item) => item.storageClass ?? '-',
              },
              {
                id: 'actions',
                header: 'Actions',
                cell: (item) =>
                  item.isFolder ? null : (
                    <Button variant="inline-link" onClick={() => setDeleteKey(item.key)}>
                      Delete
                    </Button>
                  ),
              },
            ]}
            empty={
              <Box textAlign="center" color="inherit">
                <b>No objects</b>
              </Box>
            }
          />
        </div>
      )}

      <Modal
        visible={showUpload}
        onDismiss={closeUploadModal}
        header="Upload"
        size="medium"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={closeUploadModal}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleUpload} loading={uploading} disabled={uploadFiles.length === 0}>
                Upload {uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div
            onDragEnter={handleDropZoneDragEnter}
            onDragLeave={handleDropZoneDragLeave}
            onDragOver={handleDropZoneDragOver}
            onDrop={handleDropZoneDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dropZoneDragOver ? '#007af3' : '#aab7b8'}`,
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: dropZoneDragOver ? 'rgba(0, 122, 243, 0.05)' : 'transparent',
              transition: 'border-color 0.15s, background-color 0.15s',
            }}
          >
            <SpaceBetween size="xs">
              <Box fontSize="heading-s" color={dropZoneDragOver ? 'text-status-info' : 'text-body-secondary'}>
                Drag files here or click to browse
              </Box>
              <Box variant="small" color="text-body-secondary">
                Multiple files supported
              </Box>
            </SpaceBetween>
          </div>

          {uploadFiles.length > 0 && (
            <div>
              <Box variant="h4" margin={{ bottom: 'xs' }}>Files ({uploadFiles.length})</Box>
              <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                {uploadFiles.map((file, i) => (
                  <div
                    key={`${file.name}-${file.size}-${i}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '4px 0',
                      borderBottom: '1px solid #eaeded',
                    }}
                  >
                    <SpaceBetween direction="horizontal" size="xs">
                      <Box>{file.name}</Box>
                      <Box variant="small" color="text-body-secondary">{formatSize(file.size)}</Box>
                    </SpaceBetween>
                    <Button variant="inline-link" onClick={() => removeFile(i)}>Remove</Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <FormField label="Key prefix" description={`Files will be uploaded to: ${uploadPrefix}<filename>`}>
            <Input value={uploadPrefix} onChange={({ detail }) => setUploadPrefix(detail.value)} placeholder="folder/" />
          </FormField>

          {uploading && uploadProgress.total > 0 && (
            <ProgressBar
              value={(uploadProgress.current / uploadProgress.total) * 100}
              description={`Uploading ${uploadProgress.fileName}`}
              additionalInfo={`${uploadProgress.current} of ${uploadProgress.total}`}
            />
          )}
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteKey !== null}
        onDismiss={() => setDeleteKey(null)}
        header="Delete object"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteKey(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete <b>{deleteKey}</b>?
      </Modal>

      <Modal
        visible={showDeleteBucket}
        onDismiss={() => setShowDeleteBucket(false)}
        header="Delete bucket"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDeleteBucket(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeleteBucket} loading={deletingBucket}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete bucket <b>{bucketName}</b>?
      </Modal>

      <Modal
        visible={showView}
        onDismiss={() => setShowView(false)}
        header={viewKey}
        size="large"
        footer={
          <Box float="right">
            <Button variant="link" onClick={() => setShowView(false)}>
              Close
            </Button>
          </Box>
        }
      >
        {viewLoading ? (
          <Spinner />
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, maxHeight: '60vh', overflow: 'auto' }}>
            {viewBody}
          </pre>
        )}
      </Modal>
    </SpaceBetween>
  );
}
