import { fakerEN_IN as faker } from '@faker-js/faker';
import { id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Reference data: the taxonomy, brands, sellers, warehouses, support queues
 * and couriers. Scope pickers, entity lookups and global search all read from
 * here in Phase 0; the domain modules build on it from Phase 1.
 *
 * Category and brand names mirror the mobile app's own mock data under
 * Ecommerce/src/features, so both products tell the same story.
 */

const TAXONOMY = {
  Fashion: {
    'Men': ['Shirts', 'T-Shirts', 'Trousers', 'Footwear'],
    'Women': ['Kurtis', 'Dresses', 'Sarees', 'Handbags'],
    'Kids': ['Boys Clothing', 'Girls Clothing'],
  },
  Mobiles: {
    'Smartphones': ['Android Phones', 'iPhones'],
    'Mobile Accessories': ['Mobile Covers', 'Screen Guards', 'Chargers', 'Power Banks'],
  },
  Electronics: {
    'Audio': ['True Wireless Earbuds', 'Headphones', 'Bluetooth Speakers'],
    'Wearables': ['Smartwatches', 'Fitness Bands'],
    'Computers': ['Laptops', 'Keyboards', 'Monitors'],
  },
  Beauty: {
    'Makeup': ['Lipsticks', 'Foundation', 'Makeup Organizers'],
    'Fragrances': ['Deodorants', 'Perfumes'],
    'Skin Care': ['Moisturisers', 'Sunscreen'],
  },
  Home: {
    'Kitchen': ['Cookware', 'Dinnerware', 'Mugs & Cups'],
    'Furnishing': ['Bedsheets', 'Curtains'],
    'Lighting': ['Desk Lamps', 'LED Bulbs'],
  },
  Grocery: {
    'Packaged Food': ['Noodles & Pasta', 'Snacks', 'Beverages'],
    'Pet Supplies': ['Pet Food', 'Pet Grooming'],
  },
  Sports: {
    'Fitness': ['Yoga Mats', 'Dumbbells'],
    'Outdoor': ['Backpacks', 'Helmets', 'Waist Bags'],
  },
  'Toys & Baby': {
    'Toys': ['Soft Toys', 'Board Games'],
    'Stationery': ['Notebooks & Diaries'],
  },
};

/** Return windows differ by category the way they do on real marketplaces. */
const RETURN_WINDOW = { Fashion: 14, Mobiles: 7, Electronics: 7, Beauty: 0, Grocery: 0 };
const GST_RATE = { Fashion: 5, Mobiles: 18, Electronics: 18, Beauty: 18, Home: 12, Grocery: 5, Sports: 12 };

export function seedCategories() {
  const rows = [];
  const make = (name, parentId, level, rootName, order) => {
    const row = insert('categories', {
      id: id('CAT', 4),
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      parentId,
      level,
      rootName,
      sortOrder: order,
      status: 'ACTIVE',
      returnWindowDays: RETURN_WINDOW[rootName] ?? 10,
      returnTypes: (RETURN_WINDOW[rootName] ?? 10) === 0 ? [] : ['REFUND', 'REPLACEMENT'],
      gated: rootName === 'Grocery' || name === 'iPhones',
      codAllowed: true,
      assuredEligible: level === 3,
      gstRate: GST_RATE[rootName] ?? 18,
      hsnCode: null,
      liveListings: level === 3 ? faker.number.int({ min: 0, max: 900 }) : 0,
      version: 1,
    });
    rows.push(row);
    return row;
  };

  let o1 = 0;
  for (const [root, l2map] of Object.entries(TAXONOMY)) {
    o1 += 1;
    const l1 = make(root, null, 1, root, o1);
    let o2 = 0;
    for (const [l2name, l3names] of Object.entries(l2map)) {
      o2 += 1;
      const l2 = make(l2name, l1.id, 2, root, o2);
      l3names.forEach((l3name, i) => make(l3name, l2.id, 3, root, i + 1));
    }
  }
  return rows;
}

const BRANDS = [
  ['boAt', 'Electronics'], ['Noise', 'Electronics'], ['Mi', 'Electronics'], ['Fastrack', 'Fashion'],
  ['Puma', 'Fashion'], ['Wildcraft', 'Sports'], ['Denver', 'Beauty'], ['TVS', 'Sports'],
  ['Beyoung', 'Fashion'], ['Roadster', 'Fashion'], ['HRX', 'Fashion'], ['Prestige', 'Home'],
  ['Maggi', 'Grocery'], ['Drools', 'Grocery'], ['Pedigree', 'Grocery'], ['Layasa', 'Fashion'],
  ['KAJARU', 'Fashion'], ['Norvex', 'Electronics'], ['Glowline', 'Home'], ['Purelume', 'Home'],
];

export function seedBrands() {
  return BRANDS.map(([name, root], i) =>
    insert('brands', {
      id: id('BRD', 3),
      name,
      rootCategory: root,
      status: i % 9 === 0 ? 'PENDING' : 'VERIFIED',
      ownerType: i % 3 === 0 ? 'BRAND_OWNER' : 'RESELLER_AUTHORISED',
      gated: ['Maggi', 'Drools', 'Pedigree'].includes(name),
      authorisedSellerCount: faker.number.int({ min: 1, max: 24 }),
      listings: faker.number.int({ min: 10, max: 1200 }),
      createdAt: mockNowIso(),
      version: 1,
    }),
  );
}

const CITIES = [
  ['Ahmedabad', 'Gujarat', '380015'], ['Mumbai', 'Maharashtra', '400072'],
  ['Bengaluru', 'Karnataka', '560066'], ['Delhi', 'Delhi', '110020'],
  ['Pune', 'Maharashtra', '411014'], ['Jaipur', 'Rajasthan', '302018'],
  ['Surat', 'Gujarat', '395007'], ['Hyderabad', 'Telangana', '500081'],
  ['Chennai', 'Tamil Nadu', '600032'], ['Kolkata', 'West Bengal', '700091'],
  ['Indore', 'Madhya Pradesh', '452010'], ['Lucknow', 'Uttar Pradesh', '226010'],
];

const SELLER_STATES = [
  ...Array(62).fill('ACTIVE'),
  ...Array(9).fill('APPLIED'),
  ...Array(8).fill('DOCUMENTS_PENDING'),
  ...Array(11).fill('UNDER_REVIEW'),
  ...Array(5).fill('NEEDS_INFO'),
  ...Array(6).fill('ONBOARDING'),
  ...Array(5).fill('ON_HOLD'),
  ...Array(6).fill('SUSPENDED'),
  ...Array(4).fill('DEACTIVATED'),
  ...Array(2).fill('BLACKLISTED'),
  ...Array(2).fill('REJECTED'),
];

const SUFFIX = ['Enterprises', 'Traders', 'Retail', 'Creations', 'Industries', 'Exports', 'Mart', 'Collection'];
const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

/** 120 sellers covering every lifecycle state (plan §6 seed table). */
export function seedSellers() {
  return SELLER_STATES.map((status, i) => {
    const [city, state, pincode] = CITIES[i % CITIES.length];
    const storeName = `${faker.person.lastName()} ${SUFFIX[i % SUFFIX.length]}`;
    const active = status === 'ACTIVE';
    return insert('sellers', {
      id: id('SEL', 4),
      storeName,
      legalName: `${storeName} Pvt Ltd`,
      status,
      tier: active ? TIERS[i % 4] : 'BRONZE',
      gstin: `${String(24 + (i % 12)).padStart(2, '0')}AADCB${String(2000 + i).slice(0, 4)}K1Z${i % 10}`,
      pan: `AADCB${String(2000 + i).slice(0, 4)}K`,
      city,
      state,
      pincode,
      rating: active ? Number((3.4 + (i % 16) / 10).toFixed(1)) : null,
      liveListings: active ? faker.number.int({ min: 4, max: 820 }) : 0,
      gmv30dPaise: active ? faker.number.int({ min: 50_000, max: 48_00_000 }) * 100 : 0,
      orders30d: active ? faker.number.int({ min: 5, max: 3200 }) : 0,
      cancellationPct: active ? Number((Math.random() * 5).toFixed(2)) : 0,
      lateDispatchPct: active ? Number((Math.random() * 8).toFixed(2)) : 0,
      returnPct: active ? Number((Math.random() * 12).toFixed(2)) : 0,
      payoutOnHold: status === 'ON_HOLD' || status === 'SUSPENDED',
      accountManagerId: null,
      fulfillmentTypes: i % 4 === 0 ? ['SELLER', 'ARISE'] : ['SELLER'],
      appliedAt: new Date(mockNow() - (160 - i) * 86400_000).toISOString(),
      joinedAt: active ? new Date(mockNow() - (150 - i) * 86400_000).toISOString() : null,
      version: 1,
    });
  });
}

export function seedWarehouses() {
  const data = [
    ['WH-BHW', 'Bhiwandi FC', 'Bhiwandi', 'Maharashtra', '421302', 'FULFILMENT'],
    ['WH-BLR', 'Bengaluru FC', 'Bengaluru', 'Karnataka', '562149', 'FULFILMENT'],
    ['WH-GGN', 'Gurugram FC', 'Gurugram', 'Haryana', '122413', 'FULFILMENT'],
    ['WH-KOL', 'Kolkata Returns Centre', 'Kolkata', 'West Bengal', '711302', 'RETURNS'],
  ];
  return data.map(([code, name, city, state, pincode, type], i) =>
    insert('warehouses', {
      id: id('WRH', 3),
      code,
      name,
      type,
      city,
      state,
      pincode,
      gstin: `${String(24 + i).padStart(2, '0')}AAACA1234A1Z${i}`,
      status: 'ACTIVE',
      inboundPaused: false,
      outboundPaused: false,
      capacityUsedPct: faker.number.int({ min: 42, max: 91 }),
      skuCount: faker.number.int({ min: 800, max: 4200 }),
      unitCount: faker.number.int({ min: 9000, max: 120000 }),
      dispatchCutoff: '18:00',
      version: 1,
    }),
  );
}

export function seedSupportQueues() {
  const names = [
    ['Orders & Shipping', 'orders'],
    ['Payments & Refunds', 'payments'],
    ['Returns & Exchange', 'returns'],
    ['Account & Profile', 'account'],
    ['Seller Issues', 'seller'],
  ];
  return names.map(([name, key]) =>
    insert('supportQueues', {
      id: id('QUE', 3),
      key,
      name,
      openTickets: faker.number.int({ min: 3, max: 180 }),
      breaching: faker.number.int({ min: 0, max: 14 }),
      version: 1,
    }),
  );
}

export function seedCouriers() {
  const names = ['Arise Logistics', 'Swiftex', 'BlueCart', 'Natrans', 'MetroShip'];
  return names.map((name, i) =>
    insert('couriers', {
      id: id('CUR', 3),
      name,
      type: i === 3 ? 'REVERSE' : 'BOTH',
      modes: i % 2 === 0 ? ['SURFACE', 'AIR'] : ['SURFACE'],
      status: i === 4 ? 'PAUSED' : 'ACTIVE',
      codEnabled: i !== 4,
      allocationPriority: i + 1,
      onTimePct: Number((88 + Math.random() * 10).toFixed(1)),
      rtoPct: Number((2 + Math.random() * 6).toFixed(2)),
      pickupSuccessPct: Number((90 + Math.random() * 9).toFixed(1)),
      pincodeCount: faker.number.int({ min: 8000, max: 19000 }),
      apiHealth: i === 4 ? 'ERROR' : 'OK',
      version: 1,
    }),
  );
}
