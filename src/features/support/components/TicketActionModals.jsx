import { Form, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import EntitySelect from '@shared/components/EntitySelect';
import { supportApi, supportKeys } from '../api/support.api';

const RESOLUTION_CODES = [
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'REPLACED', label: 'Replaced' },
  { value: 'INFO_PROVIDED', label: 'Info provided' },
  { value: 'NO_FAULT_FOUND', label: 'No fault found' },
];

/** Assign, escalate, merge and resolve — the ticket-level actions outside the composer. */
export default function TicketActionModals({ ticket, modal, onClose, onSubmit, loading }) {
  const agents = useQuery({
    queryKey: supportKeys.agents(ticket.queueId),
    queryFn: () => supportApi.agents(ticket.queueId),
    enabled: modal === 'ASSIGN',
  });

  return (
    <>
      <ConfirmActionModal
        open={modal === 'ASSIGN'}
        onCancel={onClose}
        onConfirm={(v) => onSubmit('ASSIGN', v)}
        loading={loading}
        title="Assign this ticket"
        description={ticket.subject}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Assign"
        extraFields={
          <Form.Item name="assigneeId" label="Agent" rules={[{ required: true, message: 'Choose an agent.' }]}>
            <Select
              options={(agents.data?.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.openTicketCount} open)` }))}
              loading={agents.isLoading}
            />
          </Form.Item>
        }
      />

      <ConfirmActionModal
        open={modal === 'ESCALATE'}
        onCancel={onClose}
        onConfirm={(v) => onSubmit('ESCALATE', v)}
        loading={loading}
        title="Escalate this ticket"
        description={ticket.subject}
        impact="Moves to Pending Internal until the team you escalate to responds — the customer sees no change yet."
        reasonRequired
        reasonLabel="Why is this being escalated?"
        showNote={false}
        confirmLabel="Escalate"
        extraFields={
          <Form.Item name="team" label="Escalate to" initialValue="seller-ops">
            <Select
              options={[
                { value: 'seller-ops', label: 'Seller operations' },
                { value: 'finance', label: 'Finance' },
                { value: 'logistics', label: 'Logistics' },
                { value: 'catalog', label: 'Catalog' },
              ]}
            />
          </Form.Item>
        }
      />

      <ConfirmActionModal
        open={modal === 'MERGE'}
        onCancel={onClose}
        onConfirm={(v) => onSubmit('MERGE', v)}
        loading={loading}
        danger
        title="Merge this ticket into another"
        description={ticket.subject}
        impact="This ticket closes and every future reply happens on the ticket you merge into. This cannot be undone."
        reasonRequired={false}
        showNote={false}
        typeToConfirm="MERGE"
        confirmLabel="Merge"
        extraFields={
          <Form.Item name="targetTicketId" label="Merge into" rules={[{ required: true, message: 'Choose the ticket to keep.' }]}>
            <EntitySelect entity="ticket" placeholder="Search by ticket ID or subject" />
          </Form.Item>
        }
      />

      <ConfirmActionModal
        open={modal === 'RESOLVE'}
        onCancel={onClose}
        onConfirm={(v) => onSubmit('TRANSITION', { status: 'RESOLVED', resolutionCode: v.resolutionCode })}
        loading={loading}
        title="Resolve this ticket"
        description={ticket.subject}
        impact="The customer is asked for CSAT once this is confirmed."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Resolve"
        extraFields={
          <Form.Item name="resolutionCode" label="Resolution code" rules={[{ required: true, message: 'Required.' }]}>
            <Select options={RESOLUTION_CODES} />
          </Form.Item>
        }
      />
    </>
  );
}
