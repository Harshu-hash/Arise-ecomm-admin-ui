import { Flex, Select, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import EntitySelect from '@shared/components/EntitySelect';
import { marketingApi } from '../api/marketing.api';

/**
 * Who a coupon or campaign reaches: everyone, first-timers, a saved
 * segment, or an explicit list. Shared across both because the audience
 * shape (`{ type, segmentId?, customerIds? }`) is identical, and both are
 * resolved by the same `resolveAudience` on the server.
 */
export default function AudiencePicker({ value, onChange, segments }) {
  const audience = value ?? { type: 'ALL' };

  const reach = useQuery({
    queryKey: ['marketing', 'audienceReach', audience],
    queryFn: () => marketingApi.campaignReach(audience),
    staleTime: 10_000,
  });

  return (
    <Flex vertical gap={8}>
      <Select
        value={audience.type}
        style={{ width: 220 }}
        onChange={(type) => onChange({ type })}
        options={[
          { value: 'ALL', label: 'Everyone' },
          { value: 'NEW', label: 'New customers (no orders yet)' },
          { value: 'SEGMENT', label: 'A saved segment' },
          { value: 'CUSTOM', label: 'Specific customers' },
        ]}
      />

      {audience.type === 'SEGMENT' && (
        <Select
          placeholder="Choose a segment"
          style={{ width: 280 }}
          value={audience.segmentId}
          onChange={(segmentId) => onChange({ ...audience, segmentId })}
          options={(segments ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.memberCount})` }))}
        />
      )}

      {audience.type === 'CUSTOM' && (
        <EntitySelect
          entity="customer"
          multiple
          placeholder="Search and add customers"
          value={audience.customerIds}
          onChange={(customerIds) => onChange({ ...audience, customerIds })}
          style={{ width: '100%' }}
        />
      )}

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Estimated reach: <strong className="tabular">{reach.data?.data?.reach ?? '—'}</strong> customers
      </Typography.Text>
    </Flex>
  );
}
