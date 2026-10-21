import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * The records an onboarding reviewer actually works through: KYC documents,
 * pickup addresses, bank details and the verification results that come back
 * from the GSTIN, PAN and penny-drop providers.
 */

/** Documents every seller must supply, plus the gated-category extras. */
const REQUIRED_DOCS = [
  ['GST_CERTIFICATE', 'GST registration certificate'],
  ['PAN_CARD', 'PAN card'],
  ['CANCELLED_CHEQUE', 'Cancelled cheque'],
  ['ADDRESS_PROOF', 'Pickup address proof'],
];

const OPTIONAL_DOCS = [
  ['FSSAI_LICENSE', 'FSSAI license'],
  ['BRAND_AUTHORISATION', 'Brand authorisation letter'],
];

/** Pre-approval states where documents are still being chased. */
const PENDING_STATES = ['APPLIED', 'DOCUMENTS_PENDING', 'UNDER_REVIEW', 'NEEDS_INFO'];

function docStatusFor(sellerStatus, index) {
  if (['ACTIVE', 'ONBOARDING', 'APPROVED', 'ON_HOLD'].includes(sellerStatus)) return 'APPROVED';
  if (sellerStatus === 'REJECTED') return index === 0 ? 'REJECTED' : 'PENDING';
  if (sellerStatus === 'NEEDS_INFO') return index < 2 ? 'APPROVED' : 'PENDING';
  if (sellerStatus === 'UNDER_REVIEW') return index < 3 ? 'APPROVED' : 'PENDING';
  if (sellerStatus === 'DOCUMENTS_PENDING') return index === 0 ? 'APPROVED' : 'MISSING';
  if (sellerStatus === 'APPLIED') return 'MISSING';
  return 'APPROVED';
}

export function seedSellerDetail() {
  for (const seller of db.sellers) {
    const settled = !PENDING_STATES.includes(seller.status) && seller.status !== 'REJECTED';

    REQUIRED_DOCS.forEach(([type, label], i) => {
      const status = docStatusFor(seller.status, i);
      if (status === 'MISSING') return;
      insert('kycDocuments', {
        id: id('DOC', 6),
        sellerId: seller.id,
        type,
        label,
        fileName: `${type.toLowerCase()}-${seller.id}.pdf`,
        mimeType: type === 'CANCELLED_CHEQUE' ? 'image/jpeg' : 'application/pdf',
        uploadedAt: new Date(mockNow() - faker.number.int({ min: 2, max: 40 }) * 86400_000).toISOString(),
        status,
        rejectionReason: status === 'REJECTED' ? 'Document is illegible — please re-upload a clear scan.' : null,
        // Licenses expire; the panel warns 30 days out.
        expiresAt: null,
        version: 1,
      });
    });

    // A handful of sellers carry a category license, one of them expiring soon.
    if (settled && Number(seller.id.slice(-2)) % 17 === 0) {
      const [type, label] = OPTIONAL_DOCS[0];
      insert('kycDocuments', {
        id: id('DOC', 6),
        sellerId: seller.id,
        type,
        label,
        fileName: `${type.toLowerCase()}-${seller.id}.pdf`,
        mimeType: 'application/pdf',
        uploadedAt: new Date(mockNow() - 300 * 86400_000).toISOString(),
        status: 'APPROVED',
        rejectionReason: null,
        expiresAt: new Date(mockNow() + 20 * 86400_000).toISOString(),
        version: 1,
      });
    }

    insert('pickupAddresses', {
      id: id('PCK', 6),
      sellerId: seller.id,
      label: 'Primary warehouse',
      line1: faker.location.streetAddress(),
      line2: faker.location.secondaryAddress(),
      city: seller.city,
      state: seller.state,
      pincode: seller.pincode,
      contactName: faker.person.fullName(),
      contactPhone: `9${faker.string.numeric(9)}`,
      isPrimary: true,
      geoVerified: settled,
      serviceableCouriers: db.couriers.filter((c) => c.status === 'ACTIVE').slice(0, 3).map((c) => c.id),
      version: 1,
    });

    const nameMatchPct = settled ? faker.number.int({ min: 92, max: 100 }) : faker.number.int({ min: 54, max: 99 });
    insert('bankAccounts', {
      id: id('BNK', 6),
      sellerId: seller.id,
      accountHolder: seller.legalName,
      accountNumber: faker.string.numeric(14),
      ifsc: `HDFC000${faker.string.numeric(4)}`,
      bankName: faker.helpers.arrayElement(['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank']),
      branch: `${seller.city} Main Branch`,
      // The penny drop is what actually proves the account belongs to them.
      pennyDropStatus: settled ? 'VERIFIED' : faker.helpers.arrayElement(['PENDING', 'VERIFIED', 'NAME_MISMATCH']),
      nameMatchPct,
      verified: settled,
      version: 1,
    });
  }
}

/** GSTIN and PAN verification results, stored on the seller for the workbench. */
export function attachVerifications() {
  for (const seller of db.sellers) {
    const settled = !PENDING_STATES.includes(seller.status) && seller.status !== 'REJECTED';
    const matchPct = settled ? 100 : faker.number.int({ min: 61, max: 100 });

    seller.gstinVerification = {
      status: settled ? 'ACTIVE' : faker.helpers.arrayElement(['ACTIVE', 'ACTIVE', 'PENDING', 'CANCELLED']),
      legalName: seller.legalName,
      nameMatchPct: matchPct,
      registeredOn: new Date(mockNow() - faker.number.int({ min: 400, max: 2000 }) * 86400_000).toISOString(),
      principalPlace: `${seller.city}, ${seller.state}`,
      checkedAt: mockNowIso(),
    };
    seller.panVerification = {
      status: settled ? 'VALID' : faker.helpers.arrayElement(['VALID', 'VALID', 'NOT_FOUND']),
      nameMatchPct: matchPct,
      checkedAt: mockNowIso(),
    };
    seller.businessType = faker.helpers.arrayElement([
      'PROPRIETORSHIP',
      'PARTNERSHIP',
      'LLP',
      'PRIVATE_LIMITED',
    ]);
    seller.contactEmail = `${seller.storeName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
    seller.contactPhone = `9${faker.string.numeric(9)}`;
    seller.emailVerified = settled;
    seller.phoneVerified = true;
    seller.requestedCategories = db.categories
      .filter((c) => c.level === 1)
      .slice(0, faker.number.int({ min: 1, max: 3 }))
      .map((c) => c.id);
    seller.commissionPlan = settled ? 'STANDARD' : null;
    seller.payoutCycle = 'WEEKLY';
    seller.assignedToId = null;
  }
}
