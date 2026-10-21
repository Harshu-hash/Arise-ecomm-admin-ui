import { ArrowLeftOutlined } from '@ant-design/icons';
import { App, Button, Col, Row, Space } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Can } from '@core/rbac/Can';
import { queryClient } from '@core/api/queryClient';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { supportApi, supportKeys } from '../api/support.api';
import TicketActionModals from '../components/TicketActionModals';
import TicketComposer from '../components/TicketComposer';
import TicketCustomerPanel from '../components/TicketCustomerPanel';
import TicketThread from '../components/TicketThread';

/**
 * The agent console (M14.1): conversation on the left, Customer 360 and
 * inline order context on the right. Order actions themselves (cancel,
 * refund, reschedule) are left to the order detail page this links to
 * rather than re-implemented here — see the module specs for why.
 */
export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [modal, setModal] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: supportKeys.ticket(id),
    queryFn: () => supportApi.ticket(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: supportKeys.ticket(id) });
    queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
  };

  const act = useMutation({
    mutationFn: ({ kind, values }) => {
      if (kind === 'ASSIGN') return supportApi.assignTicket(id, values.assigneeId);
      if (kind === 'ESCALATE') return supportApi.escalateTicket(id, { team: values.team, reason: values.reason });
      if (kind === 'MERGE') return supportApi.mergeTicket(id, values.targetTicketId);
      if (kind === 'TRANSITION') return supportApi.transitionTicket(id, { status: values.status, resolutionCode: values.resolutionCode });
      return Promise.reject(new Error('Unknown action'));
    },
    onSuccess: () => { invalidate(); setModal(null); message.success('Done'); },
    onError: (e) => message.error(e.message),
  });

  if (isLoading) return <FullPageSpinner label="Loading ticket…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load this ticket" />;

  const ticket = data.data;
  const closed = ticket.status === 'CLOSED';

  return (
    <>
      <PageHeader
        title={`${ticket.id} · ${ticket.subject}`}
        breadcrumbs={[{ label: 'Support' }, { label: 'Tickets', to: '/support/tickets' }, { label: ticket.id }]}
        onBack={<Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back to tickets" onClick={() => navigate('/support/tickets')} />}
        tags={
          <Space size={6}>
            <StatusTag domain="ticket" code={ticket.status} />
            <StatusTag domain="priority" code={ticket.priority} showIcon={false} />
          </Space>
        }
        actions={
          !closed && (
            <Space wrap>
              <Can perm="support.ticket.assign">
                <Button onClick={() => setModal('ASSIGN')}>{ticket.assigneeName ? 'Reassign' : 'Assign'}</Button>
              </Can>
              <Can perm="support.ticket.escalate">
                <Button onClick={() => setModal('ESCALATE')} disabled={ticket.status !== 'OPEN'}>Escalate</Button>
              </Can>
              <Can perm="support.ticket.merge">
                <Button onClick={() => setModal('MERGE')}>Merge</Button>
              </Can>
              <Can perm="support.ticket.close">
                <Button type="primary" onClick={() => setModal('RESOLVE')} disabled={ticket.status === 'NEW'}>
                  Resolve
                </Button>
              </Can>
            </Space>
          )
        }
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={15}>
          <TicketThread events={ticket.events} />
          {!closed && <TicketComposer ticket={ticket} onSent={invalidate} />}
        </Col>
        <Col xs={24} lg={9}>
          <TicketCustomerPanel ticket={ticket} />
        </Col>
      </Row>

      <TicketActionModals
        ticket={ticket}
        modal={modal}
        onClose={() => setModal(null)}
        onSubmit={(kind, values) => act.mutate({ kind, values })}
        loading={act.isPending}
      />
    </>
  );
}
