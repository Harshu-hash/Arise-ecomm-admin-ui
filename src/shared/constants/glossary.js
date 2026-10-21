/**
 * Full forms for the domain abbreviations this panel's labels, stat tiles
 * and table headers use throughout — Indian e-commerce and tax terms an
 * operator new to the platform (or just new to India) cannot be expected to
 * already know. `GlossaryText` looks a plain string up against this map and
 * wraps any match in a tooltip, so one dictionary entry here covers every
 * place that abbreviation appears, rather than a tooltip hand-wired at each.
 *
 * Longer, more specific keys are matched before shorter ones they contain
 * (e.g. `GSTR-8` before `GSTR` before `GST`) — see `GlossaryText`'s sorting.
 */
export const GLOSSARY = {
  'GSTR-8': 'GST Return, Form 8 — the monthly e-commerce operator return TCS is reported on',
  'GSTR-1': 'GST Return, Form 1 — outward supplies return',
  'GSTR-3B': 'GST Return, Form 3B — the monthly summary GST return',
  GSTIN: 'GST Identification Number',
  GSTR: 'GST Return',
  GST: 'Goods and Services Tax',
  CGST: 'Central GST — the central government\'s share on an intra-state sale',
  SGST: 'State GST — the state government\'s share on an intra-state sale',
  IGST: 'Integrated GST — charged instead of CGST+SGST on an inter-state sale',
  TCS: 'Tax Collected at Source — GST the platform collects from sellers on each sale',
  TDS: 'Tax Deducted at Source — income tax withheld from seller payouts',
  HSN: 'Harmonized System of Nomenclature — the product code GST rates are based on',
  PAN: 'Permanent Account Number — the tax ID used for TDS filing',
  KYC: 'Know Your Customer — identity and bank verification before a seller can go live',
  COD: 'Cash on Delivery',
  UPI: 'Unified Payments Interface',
  ARN: 'Acknowledgement Reference Number — a refund\'s tracking reference at the bank',
  GMV: 'Gross Merchandise Value — the total value of goods sold, before returns or fees',
  AOV: 'Average Order Value',
  SKU: 'Stock Keeping Unit — a unique code identifying one sellable variant',
  MRP: 'Maximum Retail Price',
  EAN: 'European Article Number — the barcode printed on the product',
  SLA: 'Service Level Agreement — the time target an action is expected to complete within',
  QC: 'Quality Control',
  QA: 'Quality Assurance',
  NDR: 'Non-Delivery Report — filed when a courier cannot deliver a shipment',
  RTO: 'Return to Origin — an undelivered shipment sent back to the seller or warehouse',
  AWB: 'Air Waybill — the courier\'s tracking number for a shipment',
  GRN: 'Goods Receipt Note — recorded when an inbound consignment is counted in',
  FBA: 'Fulfilled by Arise — Arise\'s own warehouses pick, pack and ship the order',
  CPC: 'Cost Per Click — what the advertiser pays each time their ad is clicked',
  CTR: 'Click-Through Rate — the share of impressions that were clicked',
  ROAS: 'Return on Ad Spend — ad-driven revenue divided by ad spend',
  BXGY: 'Buy X, Get Y — a coupon that gives a free or discounted item with a qualifying purchase',
  CSAT: 'Customer Satisfaction Score',
  PII: 'Personally Identifiable Information',
  SMS: 'Short Message Service',
  DLT: 'Distributed Ledger Technology registration — TRAI\'s anti-spam registration required for sending SMS in India',
};

/** Longest key first, so `GSTR-8` is tried before `GSTR`, and `GSTR` before `GST`. */
export const GLOSSARY_TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
