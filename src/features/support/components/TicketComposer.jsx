import { App, Button, Card, Flex, Input, Segmented, Select } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { Can } from '@core/rbac/Can';
import { supportApi, supportKeys } from '../api/support.api';

const RESOLUTION_CODES = [
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'REPLACED', label: 'Replaced' },
  { value: 'INFO_PROVIDED', label: 'Info provided' },
  { value: 'NO_FAULT_FOUND', label: 'No fault found' },
];

/** Substitutes `{{path.to.field}}` tokens — the same shape the server stores a macro with. */
function renderMacro(body, context) {
  return body.replace(/{{\s*([\w.]+)\s*}}/g, (_m, path) => {
    const value = path.split('.').reduce((acc, key) => acc?.[key], context);
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Reply vs internal note, a macro to insert (rendered with this ticket's
 * own variables before the agent sees it, so they are never sending
 * `{{customer.name}}` literally), and status-on-send.
 */
export default function TicketComposer({ ticket, onSent }) {
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [macroId, setMacroId] = useState(null);
  const [visibility, setVisibility] = useState('PUBLIC');
  const [setStatus, setSetStatus] = useState(null);
  const [resolutionCode, setResolutionCode] = useState(null);

  const macros = useQuery({ queryKey: supportKeys.macros({}), queryFn: () => supportApi.macros({ pageSize: 100 }) });

  const send = useMutation({
    mutationFn: () => supportApi.postMessage(ticket.id, {
      text, visibility, macroId: macroId ?? undefined,
      setStatus: setStatus ?? undefined, resolutionCode: setStatus === 'RESOLVED' ? resolutionCode : undefined,
    }),
    onSuccess: () => {
      setText('');
      setMacroId(null);
      setSetStatus(null);
      setResolutionCode(null);
      onSent();
      message.success(visibility === 'INTERNAL' ? 'Note added' : 'Reply sent');
    },
    onError: (e) => message.error(e instanceof ApiError ? e.message : 'Could not send'),
  });

  const insertMacro = (id) => {
    const macro = macros.data?.data.find((m) => m.id === id);
    if (!macro) return;
    const rendered = renderMacro(macro.body, {
      customer: { name: ticket.customerName },
      order: { id: ticket.orderId ?? '—' },
      refund: { amount: '—', eta: '3-5 business days' },
    });
    setText(rendered);
    setMacroId(id);
  };

  return (
    <Card size="small" style={{ marginTop: 12 }}>
      <Flex vertical gap={8}>
        <Flex justify="space-between" wrap gap={8}>
          <Segmented
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'PUBLIC', label: 'Reply to customer' },
              ...(ticket.status !== 'CLOSED' ? [{ value: 'INTERNAL', label: 'Internal note' }] : []),
            ]}
          />
          <Can perm="support.macro.view">
            <Select
              placeholder="Insert a macro"
              style={{ width: 220 }}
              allowClear
              options={(macros.data?.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
              onChange={(v) => v && insertMacro(v)}
            />
          </Can>
        </Flex>

        <Input.TextArea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={visibility === 'INTERNAL' ? 'Internal note — not visible to the customer' : 'Write a reply…'}
        />

        {visibility === 'PUBLIC' && (
          <Flex gap={8} wrap align="center">
            <Select
              placeholder="Also set status to…"
              style={{ width: 180 }}
              allowClear
              value={setStatus}
              onChange={setSetStatus}
              options={[
                { value: 'PENDING_CUSTOMER', label: 'Pending customer' },
                { value: 'RESOLVED', label: 'Resolved' },
              ]}
            />
            {setStatus === 'RESOLVED' && (
              <Select
                placeholder="Resolution code"
                style={{ width: 180 }}
                value={resolutionCode}
                onChange={setResolutionCode}
                options={RESOLUTION_CODES}
              />
            )}
          </Flex>
        )}

        <Flex justify="flex-end">
          <Button
            type="primary"
            onClick={() => send.mutate()}
            loading={send.isPending}
            disabled={!text.trim() || (setStatus === 'RESOLVED' && !resolutionCode)}
          >
            {visibility === 'INTERNAL' ? 'Add note' : 'Send'}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}
