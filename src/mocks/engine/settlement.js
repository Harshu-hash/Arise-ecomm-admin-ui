/**
 * Settlement maths: what a seller is actually paid for one delivered item.
 *
 * Kept as a pure function with no database access so it can be tested
 * directly and reused by the payout screens' "preview" calculator. Every
 * amount is integer paise, and every intermediate is rounded at the point it
 * is computed — otherwise a batch of 200 sellers drifts by rupees.
 *
 *   Sale amount (what the customer paid for the item, incl. GST)
 *   − commission            % of sale, by category and price band
 *   − fixed (closing) fee   slab by item price
 *   − collection fee        % by payment mode — COD costs more to collect
 *   − shipping fee          weight × zone, charged to the seller
 *   − fulfilment fees       pick-pack + storage, only for Fulfilled-by-Arise
 *   − GST on those fees     18%, because they are services we sell
 *   − TCS                   collected under GST s.52 and paid to the state
 *   − TDS                   withheld under income tax s.194-O
 *   ± adjustments           penalties, claims, ad spend, manual corrections
 *   = net payable
 */

/** Statutory rates. Seeded values — confirm with a tax advisor before launch. */
export const TAX_RATES = {
  /** TCS under GST s.52 on the net taxable value of sales. */
  tcsPct: 0.5,
  /** TDS under income tax s.194-O on gross sales. */
  tdsPct: 0.1,
  /** GST charged on our own fees to the seller. */
  gstOnFeesPct: 18,
};

const pct = (amountPaise, percent) => Math.round((amountPaise * percent) / 100);

/** Fixed closing fee by item price band. */
export function closingFeePaise(salePaise) {
  if (salePaise <= 30000) return 500;
  if (salePaise <= 50000) return 1500;
  if (salePaise <= 100000) return 3000;
  return 6500;
}

/** Payment collection cost. Cash is handled, counted and banked, so it costs more. */
export function collectionFeePct(paymentMethod) {
  return paymentMethod === 'COD' ? 2.5 : 1.8;
}

/**
 * Computes one settlement line.
 *
 * @param {object} input
 * @param {number} input.salePaise        what the customer paid for this item
 * @param {number} input.commissionPct    from the category rule
 * @param {string} input.paymentMethod
 * @param {number} input.shippingFeePaise charged to the seller
 * @param {boolean} input.fulfilledByArise
 * @param {number} [input.storageFeePaise]
 * @param {number} [input.adjustmentsPaise] signed: negative reduces the payout
 */
export function computeSettlement({
  salePaise,
  commissionPct,
  paymentMethod,
  shippingFeePaise = 0,
  fulfilledByArise = false,
  storageFeePaise = 0,
  adjustmentsPaise = 0,
}) {
  const commission = pct(salePaise, commissionPct);
  const closingFee = closingFeePaise(salePaise);
  const collectionFee = pct(salePaise, collectionFeePct(paymentMethod));
  // Pick-and-pack is only charged when we handled the parcel.
  const pickPackFee = fulfilledByArise ? 2000 : 0;
  const storage = fulfilledByArise ? storageFeePaise : 0;

  const feesBeforeTax = commission + closingFee + collectionFee + shippingFeePaise + pickPackFee + storage;
  const gstOnFees = pct(feesBeforeTax, TAX_RATES.gstOnFeesPct);

  // TCS is on the net taxable value, TDS on gross — they have different bases.
  const tcs = pct(salePaise, TAX_RATES.tcsPct);
  const tds = pct(salePaise, TAX_RATES.tdsPct);

  const netPaise = salePaise - feesBeforeTax - gstOnFees - tcs - tds + adjustmentsPaise;

  return {
    salePaise,
    commissionPaise: commission,
    commissionPct,
    closingFeePaise: closingFee,
    collectionFeePaise: collectionFee,
    shippingFeePaise,
    pickPackFeePaise: pickPackFee,
    storageFeePaise: storage,
    feesBeforeTaxPaise: feesBeforeTax,
    gstOnFeesPaise: gstOnFees,
    tcsPaise: tcs,
    tdsPaise: tds,
    adjustmentsPaise,
    netPaise,
    // A negative net means our fees exceeded the sale: it happens on cheap
    // items with heavy shipping, and finance needs to see it rather than
    // have it silently clamped to zero.
    negative: netPaise < 0,
  };
}

/** Sums a set of settlement lines into a payout figure. */
export function summariseSettlements(lines) {
  const zero = {
    grossPaise: 0,
    commissionPaise: 0,
    feesPaise: 0,
    gstOnFeesPaise: 0,
    tcsPaise: 0,
    tdsPaise: 0,
    adjustmentsPaise: 0,
    netPaise: 0,
    count: 0,
  };

  return lines.reduce(
    (acc, l) => ({
      grossPaise: acc.grossPaise + l.salePaise,
      commissionPaise: acc.commissionPaise + l.commissionPaise,
      feesPaise: acc.feesPaise + l.feesBeforeTaxPaise,
      gstOnFeesPaise: acc.gstOnFeesPaise + l.gstOnFeesPaise,
      tcsPaise: acc.tcsPaise + l.tcsPaise,
      tdsPaise: acc.tdsPaise + l.tdsPaise,
      adjustmentsPaise: acc.adjustmentsPaise + l.adjustmentsPaise,
      netPaise: acc.netPaise + l.netPaise,
      count: acc.count + 1,
    }),
    zero,
  );
}

/**
 * Whether a delivered item's money can be released to the seller yet.
 *
 * Paying out before the return window closes means clawing money back when
 * the customer returns the item, which is far harder than holding it.
 */
export function settlementEligibility(item, { returnOpen, claimOpen, sellerOnHold, now = Date.now() }) {
  if (item.status !== 'DELIVERED') {
    return { eligible: false, reason: 'Not delivered yet' };
  }
  if (returnOpen) return { eligible: false, reason: 'A return is open on this item' };
  if (claimOpen) return { eligible: false, reason: 'A claim is open against this seller' };
  if (sellerOnHold) return { eligible: false, reason: 'Payouts are on hold for this seller' };

  if (item.returnWindowEndsAt && new Date(item.returnWindowEndsAt).getTime() > now) {
    return { eligible: false, reason: 'Return window has not closed' };
  }
  return { eligible: true, reason: null };
}
