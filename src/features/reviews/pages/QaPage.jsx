import { App, Button, Flex, Input, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { reviewsApi, reviewsKeys } from '../api/reviews.api';

/** Questions & Answers (M13.2): a question older than its SLA with no answer is flagged, same way an SLA breach is flagged for tickets. */
export default function QaPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-askedAt' });
  const [answering, setAnswering] = useState(null);
  const [answerText, setAnswerText] = useState('');

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: reviewsKeys.questions(state.queryParams),
    url: '/questions',
    params: state.queryParams,
  });

  const answer = useMutation({
    mutationFn: ({ id, text }) => reviewsApi.answerQuestion(id, text),
    onSuccess: () => { refetch(); setAnswering(null); setAnswerText(''); message.success('Answer posted'); },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'text', title: 'Question', dataIndex: 'text', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Typography.Text ellipsis style={{ fontSize: 13, maxWidth: 320 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.productTitle} · {row.customerName}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'answerCount', title: 'Answers', dataIndex: 'answerCount', align: 'right', priority: 1,
      render: (v, row) => (
        v === 0
          ? <Tag color="gold" style={{ marginInlineEnd: 0 }}>Unanswered {row.unansweredDays}d</Tag>
          : <Typography.Text className="tabular">{v}</Typography.Text>
      ),
    },
    { key: 'status', title: 'Status', dataIndex: 'status', priority: 1, render: (v) => <StatusTag domain="questionAnswer" code={v} /> },
    { key: 'askedAt', title: 'Asked', dataIndex: 'askedAt', sorter: true, priority: 2, render: (v) => <DateText value={v} variant="date" /> },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Can perm="reviews.qa.answer">
          <Button size="small" onClick={(e) => { e.stopPropagation(); setAnswering(row); }}>Answer as Arise</Button>
        </Can>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Questions & Answers"
        breadcrumbs={[{ label: 'Reviews & Q&A' }, { label: 'Q&A' }]}
        subtitle="Nudge the seller, or answer directly as Arise, when a question has sat unanswered."
      />

      <DataTable
        tableId="questions"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No questions match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Typography.Text style={{ fontSize: 13 }} ellipsis>{row.text}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.productTitle}</Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(answering)}
        onCancel={() => { setAnswering(null); setAnswerText(''); }}
        onConfirm={() => answer.mutate({ id: answering.id, text: answerText })}
        loading={answer.isPending}
        title="Answer as Arise"
        description={answering?.text}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Post answer"
        extraFields={
          <Input.TextArea
            rows={4}
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Write the answer customers will see, labelled as an Arise answer."
          />
        }
      />
    </Flex>
  );
}
