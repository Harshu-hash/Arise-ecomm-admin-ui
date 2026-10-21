import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Customers, their addresses and devices, plus the privacy and risk records
 * the support and fraud teams work from.
 *
 * Address shape mirrors the mobile app's saved addresses (label, name, line,
 * cityLine, phone) so an order rendered here matches what the customer sees.
 */

const CITIES = [
  ['Ahmedabad', 'Gujarat', '380015'], ['Mumbai', 'Maharashtra', '400072'],
  ['Bengaluru', 'Karnataka', '560066'], ['Delhi', 'Delhi', '110020'],
  ['Pune', 'Maharashtra', '411014'], ['Jaipur', 'Rajasthan', '302018'],
  ['Hyderabad', 'Telangana', '500081'], ['Chennai', 'Tamil Nadu', '600032'],
  ['Kolkata', 'West Bengal', '700091'], ['Lucknow', 'Uttar Pradesh', '226010'],
  ['Indore', 'Madhya Pradesh', '452010'], ['Surat', 'Gujarat', '395007'],
];

export const CUSTOMER_COUNT = 420;

export function seedCustomers() {
  const rows = [];

  for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
    const [city, state, pincode] = CITIES[i % CITIES.length];
    const name = faker.person.fullName();
    const joinedDaysAgo = faker.number.int({ min: 1, max: 900 });
    // A long tail of one-order customers with a small, very active head is
    // what real marketplace data looks like.
    const orders = i % 17 === 0 ? faker.number.int({ min: 20, max: 60 }) : faker.number.int({ min: 0, max: 8 });

    const blocked = i % 97 === 0;
    const customer = insert('customers', {
      id: id('CUS', 6),
      name,
      email: faker.internet.email({ firstName: name.split(' ')[0] }).toLowerCase(),
      phone: `9${faker.string.numeric(9)}`,
      city,
      state,
      joinedAt: new Date(mockNow() - joinedDaysAgo * 86400_000).toISOString(),
      status: blocked ? 'BLOCKED' : 'ACTIVE',
      blockedReason: blocked ? 'Repeated refund abuse across multiple accounts' : null,
      codDisabled: i % 61 === 0,
      ordersCount: orders,
      gmvPaise: 0,
      lastOrderAt: null,
      walletBalancePaise: i % 7 === 0 ? faker.number.int({ min: 50, max: 4000 }) * 100 : 0,
      rtoPct: Number((Math.random() * (i % 23 === 0 ? 40 : 8)).toFixed(1)),
      returnPct: Number((Math.random() * (i % 29 === 0 ? 35 : 10)).toFixed(1)),
      riskScore: i % 23 === 0 ? faker.number.int({ min: 65, max: 95 }) : faker.number.int({ min: 1, max: 40 }),
      languagePreference: i % 9 === 0 ? 'hi' : 'en',
      platform: i % 3 === 0 ? 'iOS' : 'Android',
      segments: orders > 20 ? ['High value'] : orders === 0 ? ['Never ordered'] : [],
      version: 1,
    });

    insert('customerAddresses', {
      id: id('ADR', 6),
      customerId: customer.id,
      label: 'Home',
      name,
      line: faker.location.streetAddress(),
      cityLine: `${city}, ${state} - ${pincode}`,
      pincode,
      city,
      state,
      phone: customer.phone,
      isDefault: true,
      version: 1,
    });

    insert('customerDevices', {
      id: id('DEV', 6),
      customerId: customer.id,
      model: faker.helpers.arrayElement(['Pixel 7a', 'iPhone 13', 'Galaxy S23', 'Redmi Note 12', 'OnePlus 11']),
      os: customer.platform,
      appVersion: faker.helpers.arrayElement(['4.2.0', '4.3.1', '4.4.0']),
      lastSeenAt: new Date(mockNow() - faker.number.int({ min: 0, max: 40 }) * 86400_000).toISOString(),
      ip: faker.internet.ipv4(),
      city,
    });

    rows.push(customer);
  }

  return rows;
}

const PRIVACY_TYPES = [
  ['ACCOUNT_DELETION', 'Delete my account'],
  ['DATA_EXPORT', 'Download my data'],
  ['CORRECTION', 'Correct my details'],
  ['CONSENT_WITHDRAWAL', 'Withdraw marketing consent'],
];

/** Requests arriving from the app's Delete Account and Download Data screens. */
export function seedPrivacyRequests() {
  const rows = [];
  const customers = db.customers.slice(0, 14);

  customers.forEach((customer, i) => {
    const [type, label] = PRIVACY_TYPES[i % PRIVACY_TYPES.length];
    const status = i < 5
      ? 'RECEIVED'
      : faker.helpers.arrayElement(['VERIFYING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'REJECTED']);
    const receivedAt = new Date(mockNow() - faker.number.int({ min: 1, max: 25 }) * 86400_000);

    rows.push(
      insert('privacyRequests', {
        id: id('PRV', 5),
        customerId: customer.id,
        customerName: customer.name,
        type,
        typeLabel: label,
        status,
        receivedAt: receivedAt.toISOString(),
        // Statutory clock: 30 days from receipt under the DPDP Act.
        dueAt: new Date(receivedAt.getTime() + 30 * 86400_000).toISOString(),
        assignedToId: null,
        holdReason: status === 'ON_HOLD' ? 'Tax records must be retained for 8 years' : null,
        decisionReason: status === 'REJECTED' ? 'Identity could not be verified' : null,
        version: 1,
      }),
    );
  });
  return rows;
}

const RISK_RULES = [
  ['High-value first order', 'First order above ₹25,000', 'HOLD_ORDER', true],
  ['Multiple accounts on one device', 'More than 3 accounts share a device', 'FLAG', true],
  ['COD to a high-RTO pincode', 'Pincode RTO rate above 30% and payment is COD', 'DISABLE_COD', true],
  ['Refund abuse pattern', 'More than 5 refunds in 30 days', 'FLAG', true],
  ['Velocity', 'More than 8 orders in one hour', 'HOLD_ORDER', false],
];

export function seedRiskRules() {
  return RISK_RULES.map(([name, condition, action, enabled]) =>
    insert('riskRules', {
      id: id('RSK', 3),
      name,
      condition,
      action,
      enabled,
      matchedLast7d: faker.number.int({ min: 0, max: 240 }),
      createdAt: mockNowIso(),
      version: 1,
    }),
  );
}

export function seedRiskFlags() {
  const rows = [];
  const risky = db.customers.filter((c) => c.riskScore > 60).slice(0, 18);

  risky.forEach((customer, i) => {
    const rule = db.riskRules[i % db.riskRules.length];
    rows.push(
      insert('riskFlags', {
        id: id('FLG', 5),
        entityType: 'customer',
        entityId: customer.id,
        entityLabel: customer.name,
        ruleId: rule.id,
        ruleName: rule.name,
        score: customer.riskScore,
        status: i < 9 ? 'OPEN' : faker.helpers.arrayElement(['CLEARED', 'CONFIRMED_FRAUD']),
        flaggedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 20 }) * 86400_000).toISOString(),
        reviewerName: i < 9 ? null : 'Fatima Shaikh',
        version: 1,
      }),
    );
  });
  return rows;
}

export function seedBlocklist() {
  const kinds = [
    ['PHONE', '9876500001', 'Chargeback fraud'],
    ['PHONE', '9876500042', 'Multiple account abuse'],
    ['EMAIL', 'refund.abuse@example.com', 'Serial refund claims'],
    ['DEVICE', 'DEV-FRAUD-0001', 'Linked to 14 blocked accounts'],
    ['PINCODE_COD', '845401', 'RTO rate above 60%'],
    ['PINCODE_COD', '855107', 'RTO rate above 55%'],
  ];
  return kinds.map(([kind, value, reason]) =>
    insert('blocklistEntries', {
      id: id('BLK', 4),
      kind,
      value,
      reason,
      addedByName: 'Fatima Shaikh',
      addedAt: new Date(mockNow() - faker.number.int({ min: 5, max: 200 }) * 86400_000).toISOString(),
      expiresAt: null,
      version: 1,
    }),
  );
}
