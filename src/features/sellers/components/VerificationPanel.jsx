import { CheckCircleFilled, CloseCircleFilled, WarningFilled } from '@ant-design/icons';
import { Alert, Card, Descriptions, Flex, Space, Tag, Typography } from 'antd';
import { formatDate } from '@core/utils/date';
import MaskedValue from '@shared/components/MaskedValue';

function MatchTag({ pct }) {
  if (pct === null || pct === undefined) return null;
  const tone = pct >= 95 ? 'green' : pct >= 80 ? 'gold' : 'red';
  return (
    <Tag color={tone} style={{ marginInlineEnd: 0 }}>
      {pct}% name match
    </Tag>
  );
}

function ResultIcon({ ok }) {
  return ok ? (
    <CheckCircleFilled style={{ color: 'var(--ant-color-success)' }} />
  ) : (
    <CloseCircleFilled style={{ color: 'var(--ant-color-error)' }} />
  );
}

/**
 * What the GSTIN, PAN and penny-drop providers came back with.
 *
 * A name match below 95% is the usual sign of a seller using someone else's
 * registration, so the percentage is shown rather than a bare tick.
 */
export default function VerificationPanel({ seller, bank }) {
  const gst = seller.gstinVerification ?? {};
  const pan = seller.panVerification ?? {};
  const gstOk = gst.status === 'ACTIVE';
  const panOk = pan.status === 'VALID';
  const bankOk = bank?.pennyDropStatus === 'VERIFIED';

  return (
    <Flex vertical gap={12}>
      {!gstOk && (
        <Alert
          type="error"
          showIcon
          message={`GSTIN is ${String(gst.status ?? 'unverified').toLowerCase()}`}
          description="An application cannot be approved while the GSTIN is not active."
        />
      )}

      <Card size="small" title={<Space><ResultIcon ok={gstOk} />GSTIN</Space>}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="GSTIN">
            <Typography.Text className="mono">{seller.gstin}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={gstOk ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>{gst.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Legal name">
            <Space size={8} wrap>
              {gst.legalName}
              <MatchTag pct={gst.nameMatchPct} />
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Registered">{formatDate(gst.registeredOn)}</Descriptions.Item>
          <Descriptions.Item label="Principal place">{gst.principalPlace}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title={<Space><ResultIcon ok={panOk} />PAN</Space>}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="PAN">
            <MaskedValue value={seller.pan} kind="pan" entityType="seller" entityId={seller.id} />
          </Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={panOk ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>{pan.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Name match"><MatchTag pct={pan.nameMatchPct} /></Descriptions.Item>
          <Descriptions.Item label="Business type">
            {String(seller.businessType ?? '').replace(/_/g, ' ')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title={<Space><ResultIcon ok={Boolean(bankOk)} />Bank account</Space>}>
        {bank ? (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Holder">{bank.accountHolder}</Descriptions.Item>
            <Descriptions.Item label="Account number">
              <MaskedValue
                value={bank.accountNumber}
                kind="account"
                entityType="seller"
                entityId={seller.id}
                entityLabel={seller.storeName}
              />
            </Descriptions.Item>
            <Descriptions.Item label="IFSC">
              <Typography.Text className="mono">{bank.ifsc}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Bank">{bank.bankName} · {bank.branch}</Descriptions.Item>
            <Descriptions.Item label="Penny drop">
              <Space size={8} wrap>
                <Tag color={bankOk ? 'green' : bank.pennyDropStatus === 'NAME_MISMATCH' ? 'red' : 'gold'} style={{ marginInlineEnd: 0 }}>
                  {bank.pennyDropStatus.replace(/_/g, ' ')}
                </Tag>
                <MatchTag pct={bank.nameMatchPct} />
              </Space>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">No bank account on file yet.</Typography.Text>
        )}

        {bank && bank.nameMatchPct < 95 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningFilled />}
            style={{ marginTop: 10 }}
            message="The account name does not closely match the registered business name"
            description="Confirm the account belongs to this business before approving. Payouts to a mismatched account are hard to recover."
          />
        )}
      </Card>
    </Flex>
  );
}
