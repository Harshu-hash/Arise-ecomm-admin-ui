import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/** Notification templates (M16): one row per event, each carrying every channel. */

const EVENTS = [
  ['ORDER_PLACED', 'Order placed', ['customerName', 'orderId', 'itemCount', 'grandTotal']],
  ['ORDER_PACKED', 'Order packed', ['customerName', 'orderId']],
  ['ORDER_SHIPPED', 'Order shipped', ['customerName', 'orderId', 'courierName', 'awb']],
  ['OUT_FOR_DELIVERY', 'Out for delivery', ['customerName', 'orderId', 'deliveryCode']],
  ['ORDER_DELIVERED', 'Delivered', ['customerName', 'orderId']],
  ['ORDER_CANCELLED', 'Cancelled', ['customerName', 'orderId', 'reason']],
  ['RETURN_REQUESTED', 'Return requested', ['customerName', 'orderId', 'reason']],
  ['RETURN_APPROVED', 'Return approved', ['customerName', 'orderId', 'pickupDate']],
  ['RETURN_PICKED_UP', 'Return picked up', ['customerName', 'orderId']],
  ['REFUND_COMPLETED', 'Refund completed', ['customerName', 'amount', 'mode']],
  ['PAYMENT_FAILED', 'Payment failed', ['customerName', 'orderId']],
  ['WALLET_CREDITED', 'Wallet credited', ['customerName', 'amount', 'reason']],
  ['GIFT_CARD_RECEIVED', 'Gift card received', ['customerName', 'amount', 'codeLast4']],
  ['TICKET_UPDATED', 'Ticket updated', ['customerName', 'ticketId', 'status']],
  ['SELLER_APPLICATION_STATUS', 'Seller application status', ['sellerName', 'status']],
  ['PAYOUT_PAID', 'Payout paid', ['sellerName', 'amount', 'utr']],
  ['KYC_EXPIRY', 'KYC expiring soon', ['sellerName', 'documentType', 'expiresInDays']],
];

const CHANNELS = ['PUSH', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_APP'];

function sampleContent(eventKey, channel, variables) {
  const body = `${eventKey.replace(/_/g, ' ').toLowerCase()} — ${variables.map((v) => `{{${v}}}`).join(', ')}`;
  if (channel === 'EMAIL') return { subject: `Arise: ${eventKey.replace(/_/g, ' ').toLowerCase()}`, body };
  return { body };
}

export function seedNotificationTemplates() {
  return EVENTS.map(([key, label, variables], i) =>
    insert('notificationTemplates', {
      id: id('NTT', 4),
      eventKey: key,
      eventLabel: label,
      variables,
      // WhatsApp needs provider template approval; SMS needs a DLT ID for
      // TRAI compliance — both are per-channel facts, not per-event.
      channels: Object.fromEntries(
        CHANNELS.map((channel) => [
          channel,
          {
            enabled: !(channel === 'WHATSAPP' && i % 5 === 0),
            content: sampleContent(key, channel, variables),
            dltTemplateId: channel === 'SMS' ? `DLT${faker.string.numeric(10)}` : null,
            whatsappApprovalStatus: channel === 'WHATSAPP'
              ? (i % 5 === 0 ? 'PENDING' : 'APPROVED')
              : null,
            version: 1,
            history: [],
          },
        ]),
      ),
      updatedByName: 'Varun Kapoor',
      updatedAt: mockNowIso(),
    }),
  );
}

const LOG_STATUSES = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'SENT', 'QUEUED', 'FAILED', 'BOUNCED'];

export function seedNotificationLogs() {
  const templates = db.notificationTemplates;
  const rows = [];

  for (let i = 0; i < 300; i += 1) {
    const template = templates[i % templates.length];
    const channel = CHANNELS[i % CHANNELS.length];
    const status = LOG_STATUSES[i % LOG_STATUSES.length];
    const customer = db.customers[i % db.customers.length];

    rows.push(
      insert('notificationLogs', {
        id: id('NTL', 7),
        eventKey: template.eventKey,
        eventLabel: template.eventLabel,
        channel,
        recipientMasked: channel === 'EMAIL'
          ? customer?.email?.replace(/(.{2}).*(@.*)/, '$1•••$2') ?? '•••@•••'
          : `${(customer?.phone ?? '9999999999').slice(0, 2)}•••••${(customer?.phone ?? '9999999999').slice(-3)}`,
        customerId: customer?.id ?? null,
        provider: channel === 'SMS' ? 'Kaleyra' : channel === 'EMAIL' ? 'SendGrid' : channel === 'WHATSAPP' ? 'Gupshup' : 'FCM',
        status,
        failureReason: status === 'FAILED' ? 'Provider rejected: invalid recipient' : status === 'BOUNCED' ? 'Mailbox does not exist' : null,
        sentAt: new Date(mockNow() - faker.number.int({ min: 1, max: 30 }) * 86400_000).toISOString(),
        version: 1,
      }),
    );
  }
  return rows;
}
