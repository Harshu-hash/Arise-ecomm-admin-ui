import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Empty, Flex, Image, Space, Tag, Typography } from 'antd';
import { slaCountdown } from '@core/utils/date';
import DateText from '@shared/components/DateText';
import AutoCheckPanel from './AutoCheckPanel';

const BLANK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

/** The review side of the QC workbench for the currently selected listing. */
export default function QcReviewPane({ submission, detail, onClaim, claiming, onDecide }) {
  if (!submission) {
    return (
      <Card size="small" title="Nothing selected" style={{ position: 'sticky', top: 72 }}>
        <Empty description="Pick a listing from the queue" />
      </Card>
    );
  }

  const sla = slaCountdown(submission.slaDueAt);

  return (
    <Card
      size="small"
      title="Review"
      style={{ position: 'sticky', top: 72 }}
      extra={
        submission.assignedToName ? (
          <Tag style={{ marginInlineEnd: 0 }}>{submission.assignedToName}</Tag>
        ) : (
          <Button size="small" loading={claiming} onClick={onClaim}>
            Start reviewing
          </Button>
        )
      }
    >
      <Flex vertical gap={14}>
        <Flex gap={12}>
          <Image
            src={submission.productImage}
            alt=""
            width={88}
            height={88}
            style={{ objectFit: 'cover', borderRadius: 8 }}
            fallback={BLANK}
          />
          <Flex vertical gap={4} style={{ minWidth: 0 }}>
            <Typography.Text strong>{submission.productTitle}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {submission.sellerName} · {submission.categoryPath}
            </Typography.Text>
            <Space size={6} wrap>
              <Tag style={{ marginInlineEnd: 0 }}>{submission.type.toLowerCase()}</Tag>
              {submission.priority === 'HIGH' && (
                <Tag color="red" style={{ marginInlineEnd: 0 }}>High priority</Tag>
              )}
              <Typography.Text type={sla.overdue ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                {sla.label}
              </Typography.Text>
            </Space>
          </Flex>
        </Flex>

        <AutoCheckPanel checks={submission.autoChecks} />

        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Brand">{detail.data.brandName}</Descriptions.Item>
            <Descriptions.Item label="Offers">
              {detail.meta.offers.length} offer{detail.meta.offers.length === 1 ? '' : 's'},{' '}
              {detail.meta.offers.filter((o) => o.priceAboveMrp).length > 0 ? (
                <Typography.Text type="danger">one priced above MRP</Typography.Text>
              ) : (
                'all within MRP'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Variants">{detail.meta.variants.length}</Descriptions.Item>
            <Descriptions.Item label="Content score">{detail.data.contentScore}%</Descriptions.Item>
            <Descriptions.Item label="Submitted">
              <DateText value={submission.submittedAt} />
            </Descriptions.Item>
          </Descriptions>
        )}

        <Space wrap>
          <Button type="primary" icon={<CheckOutlined />} onClick={() => onDecide('APPROVE')}>
            Approve (A)
          </Button>
          <Button icon={<EditOutlined />} onClick={() => onDecide('REQUEST_CHANGES')}>
            Request changes (C)
          </Button>
          <Button danger icon={<CloseOutlined />} onClick={() => onDecide('REJECT')}>
            Reject (R)
          </Button>
        </Space>
      </Flex>
    </Card>
  );
}
