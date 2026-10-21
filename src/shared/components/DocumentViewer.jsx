import {
  CheckOutlined,
  CloseOutlined,
  FilePdfOutlined,
  RotateRightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { Button, Flex, Space, Tag, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { useCurrentUser } from '@core/rbac/useCan';
import StatusTag from './StatusTag';

/**
 * KYC and claim document viewer with zoom, rotation and a per-document
 * decision.
 *
 * The watermark carries the viewer's email and the time: these are identity
 * documents, and a screenshot that leaks should be traceable to whoever had
 * it open.
 */
export default function DocumentViewer({ document: doc, onDecide, deciding, readOnly }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const user = useCurrentUser();

  if (!doc) return null;
  const isPdf = doc.mimeType === 'application/pdf';

  return (
    <Flex vertical gap={10}>
      <Flex justify="space-between" align="center" gap={8} wrap>
        <Space size={8} wrap>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {doc.label}
          </Typography.Text>
          <StatusTag
            domain="generic"
            code={doc.status === 'APPROVED' ? 'YES' : doc.status === 'REJECTED' ? 'ERROR' : 'NO'}
            showIcon={false}
          />
          {doc.expiresAt && (
            <Tag color={new Date(doc.expiresAt) < new Date() ? 'red' : 'gold'} style={{ marginInlineEnd: 0 }}>
              {new Date(doc.expiresAt) < new Date() ? 'Expired' : 'Expires'}{' '}
              {new Date(doc.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Tag>
          )}
        </Space>

        <Space size={2}>
          <Tooltip title="Zoom out">
            <Button size="small" type="text" icon={<ZoomOutOutlined />} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} />
          </Tooltip>
          <Tooltip title="Zoom in">
            <Button size="small" type="text" icon={<ZoomInOutlined />} onClick={() => setZoom((z) => Math.min(3, z + 0.25))} />
          </Tooltip>
          <Tooltip title="Rotate">
            <Button size="small" type="text" icon={<RotateRightOutlined />} onClick={() => setRotation((r) => (r + 90) % 360)} />
          </Tooltip>
        </Space>
      </Flex>

      <div
        style={{
          position: 'relative',
          height: 280,
          overflow: 'auto',
          borderRadius: 8,
          border: '1px solid var(--ant-color-border)',
          background: 'var(--ant-color-fill-quaternary)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {/* Mock documents have no real file, so the frame stands in for one. */}
        <div
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: 'transform 0.15s',
            display: 'grid',
            placeItems: 'center',
            gap: 8,
            padding: 24,
          }}
        >
          <FilePdfOutlined style={{ fontSize: 40, opacity: 0.3 }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {doc.fileName}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {isPdf ? 'PDF document' : 'Image'} · uploaded{' '}
            {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
          </Typography.Text>
        </div>

        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'grid',
            placeItems: 'center',
            transform: 'rotate(-24deg)',
            opacity: 0.1,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {user?.email} · {new Date().toLocaleString('en-IN')}
        </div>
      </div>

      {doc.rejectionReason && (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          Rejected: {doc.rejectionReason}
        </Typography.Text>
      )}

      {!readOnly && onDecide && (
        <Space size={8}>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            loading={deciding}
            disabled={doc.status === 'APPROVED'}
            onClick={() => onDecide(doc, true)}
          >
            {doc.status === 'APPROVED' ? 'Approved' : 'Approve'}
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            loading={deciding}
            onClick={() => onDecide(doc, false)}
          >
            Reject
          </Button>
        </Space>
      )}
    </Flex>
  );
}
