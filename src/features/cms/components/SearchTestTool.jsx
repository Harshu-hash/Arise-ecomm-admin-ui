import { Alert, Flex, Input, List, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { cmsApi } from '../api/cms.api';

/** Runs a query against the live catalog and shows which configured rule touched the result. */
export default function SearchTestTool() {
  const test = useMutation({ mutationFn: (q) => cmsApi.testSearch(q) });
  const result = test.data?.data;

  return (
    <Flex vertical gap={10}>
      <Input.Search
        placeholder="Try a search term…"
        onSearch={(q) => q.trim() && test.mutate(q.trim())}
        loading={test.isPending}
        style={{ maxWidth: 360 }}
      />

      {result?.blocked && (
        <Alert type="error" showIcon message="Blocked" description={`Matches the blocked term "${result.blockedBy}".`} />
      )}
      {result?.redirectedTo && (
        <Alert type="info" showIcon message="Redirected" description={`→ ${result.redirectedTo.type}: ${result.redirectedTo.label}`} />
      )}

      {result?.appliedRules?.length ? (
        <Flex gap={4} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Rules applied:</Typography.Text>
          {result.appliedRules.map((r, i) => (
            <Tag key={i}>{r.type === 'SYNONYM' ? `synonym: ${r.term} ↔ ${r.synonym}` : `${r.type.toLowerCase()}: ${r.scopeLabel}`}</Tag>
          ))}
        </Flex>
      ) : null}

      {result && !result.blocked && !result.redirectedTo && (
        <List
          size="small"
          dataSource={result.results}
          locale={{ emptyText: 'No results' }}
          renderItem={(r) => (
            <List.Item>
              <Flex justify="space-between" style={{ width: '100%' }}>
                <Typography.Text style={{ fontSize: 13 }}>{r.title}</Typography.Text>
                <Typography.Text type="secondary" className="tabular" style={{ fontSize: 11 }}>score {r.score}</Typography.Text>
              </Flex>
            </List.Item>
          )}
        />
      )}
    </Flex>
  );
}
