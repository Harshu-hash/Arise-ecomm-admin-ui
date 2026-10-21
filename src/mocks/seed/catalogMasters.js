import { db, id, insert } from '../db/store';
import { DEFAULT_ARISE_ASSURED, DEFAULT_WEIGHTS } from '../engine/buyBox';
import { mockNowIso } from '../engine/settings';

/**
 * Catalog masters: attributes and their sets, HSN codes with GST rates, and
 * size charts. These define the shape every listing has to fill in, so they
 * are seeded before any product.
 */

const ATTRIBUTES = [
  ['Colour', 'colour', 'COLOUR', null, true, true, ['Maroon', 'Blue', 'Black', 'Grey', 'White', 'Red', 'Green']],
  ['Size', 'size', 'SIZE', null, true, true, ['38', '40', '42', '44', '46', 'S', 'M', 'L', 'XL', 'XXL']],
  ['Brand Fit', 'fit', 'SINGLE_SELECT', null, true, false, ['Regular Fit', 'Slim Fit', 'Loose Fit']],
  ['Fabric', 'fabric', 'SINGLE_SELECT', null, true, false, ['Cotton', 'Polyester', 'Linen', 'Denim', 'Blend']],
  ['Sleeve Length', 'sleeve_length', 'SINGLE_SELECT', null, true, false, ['Full Sleeve', 'Half Sleeve', 'Sleeveless']],
  ['Pattern', 'pattern', 'SINGLE_SELECT', null, true, false, ['Solid', 'Printed', 'Striped', 'Checked', 'Textured']],
  ['Wash Care', 'wash_care', 'TEXT', null, false, false, []],
  ['Battery Life', 'battery_life', 'NUMBER', 'hours', true, false, []],
  ['Driver Size', 'driver_size', 'NUMBER', 'mm', false, false, []],
  ['Connectivity', 'connectivity', 'SINGLE_SELECT', null, true, false, ['Bluetooth 5.0', 'Bluetooth 5.3', 'Wired', '2.4GHz']],
  ['Water Resistance', 'water_resistance', 'SINGLE_SELECT', null, true, false, ['None', 'IPX4', 'IPX5', 'IPX7']],
  ['Warranty', 'warranty', 'SINGLE_SELECT', null, false, false, ['6 months', '1 year', '2 years']],
  ['Capacity', 'capacity', 'NUMBER', 'litres', true, false, []],
  ['Material', 'material', 'SINGLE_SELECT', null, true, false, ['Steel', 'Aluminium', 'Ceramic', 'Plastic', 'Glass']],
  ['Shelf Life', 'shelf_life', 'NUMBER', 'days', false, false, []],
  ['Veg / Non-veg', 'food_type', 'SINGLE_SELECT', null, true, false, ['Vegetarian', 'Non-vegetarian']],
];

export function seedAttributes() {
  const attributes = ATTRIBUTES.map(([name, code, type, unit, filterable, variantDefining, values]) =>
    insert('attributes', {
      id: id('ATR', 4),
      name,
      code,
      type,
      unit,
      filterable,
      variantDefining,
      values: values.map((v) => ({ value: v, active: true, synonyms: [] })),
      createdAt: mockNowIso(),
      version: 1,
    }),
  );

  const byCode = (code) => attributes.find((a) => a.code === code)?.id;

  const sets = [
    ['Apparel', ['colour', 'size', 'fit', 'fabric', 'sleeve_length', 'pattern', 'wash_care'], 'Fashion'],
    ['Audio', ['colour', 'battery_life', 'driver_size', 'connectivity', 'water_resistance', 'warranty'], 'Electronics'],
    ['Kitchenware', ['colour', 'capacity', 'material', 'warranty'], 'Home'],
    ['Packaged Food', ['shelf_life', 'food_type'], 'Grocery'],
    ['General', ['colour', 'material', 'warranty'], null],
  ].map(([name, codes, rootName]) =>
    insert('attributeSets', {
      id: id('ATS', 3),
      name,
      rootName,
      attributeIds: codes.map(byCode).filter(Boolean),
      version: 1,
    }),
  );

  // Attach a set to every leaf category so the product form has fields.
  for (const category of db.categories.filter((c) => c.level === 3)) {
    const match = sets.find((s) => s.rootName === category.rootName) ?? sets.at(-1);
    category.attributeSetId = match.id;
  }
  for (const attribute of attributes) {
    attribute.usedInCategories = db.categories.filter(
      (c) => c.attributeSetId && sets.find((s) => s.id === c.attributeSetId)?.attributeIds.includes(attribute.id),
    ).length;
  }

  return { attributes, sets };
}

const HSN = [
  ['6205', "Men's shirts", 5, 'Fashion'],
  ['6204', "Women's suits, dresses and skirts", 5, 'Fashion'],
  ['6403', 'Footwear with leather uppers', 18, 'Fashion'],
  ['8518', 'Headphones, earphones and loudspeakers', 18, 'Electronics'],
  ['8517', 'Telephone sets and smartphones', 18, 'Mobiles'],
  ['9102', 'Wrist watches and smartwatches', 18, 'Electronics'],
  ['8471', 'Automatic data processing machines', 18, 'Electronics'],
  ['3304', 'Beauty and make-up preparations', 18, 'Beauty'],
  ['3307', 'Pre-shave, shaving and deodorants', 18, 'Beauty'],
  ['7323', 'Table and kitchen articles of iron or steel', 12, 'Home'],
  ['6302', 'Bed linen, table linen and kitchen linen', 12, 'Home'],
  ['9405', 'Lamps and lighting fittings', 12, 'Home'],
  ['1902', 'Pasta, noodles and couscous', 12, 'Grocery'],
  ['2309', 'Preparations used in animal feeding', 18, 'Grocery'],
  ['4202', 'Trunks, suitcases and backpacks', 18, 'Sports'],
  ['6506', 'Safety headgear and helmets', 18, 'Sports'],
  ['9503', 'Tricycles, dolls and other toys', 12, 'Toys & Baby'],
  ['4820', 'Registers, notebooks and diaries', 12, 'Toys & Baby'],
];

export function seedHsn() {
  const rows = HSN.map(([code, description, gstRate, rootName]) =>
    insert('hsnCodes', {
      id: id('HSN', 4),
      code,
      description,
      gstRate,
      cess: 0,
      effectiveFrom: '2024-04-01T00:00:00.000Z',
      rootName,
      version: 1,
    }),
  );

  // Default each category to the HSN that matches its root.
  for (const category of db.categories) {
    const match = rows.find((h) => h.rootName === category.rootName);
    if (match) {
      category.hsnCode = match.code;
      category.gstRate = match.gstRate;
    }
  }
  return rows;
}

export function seedSizeCharts() {
  const apparel = db.categories.find((c) => c.name === 'Shirts');
  const footwear = db.categories.find((c) => c.name === 'Footwear');

  return [
    insert('sizeCharts', {
      id: id('SZC', 3),
      name: "Men's Shirts (inches)",
      categoryId: apparel?.id ?? null,
      brandId: null,
      unit: 'in',
      columns: ['Size', 'Chest', 'Length', 'Shoulder'],
      // Matches the size chart the mobile app's product page renders.
      rows: [
        ['38', '38', '28.5', '16.5'],
        ['40', '40', '29', '17'],
        ['42', '42', '29.5', '17.5'],
        ['44', '44', '30', '18'],
        ['46', '46', '30.5', '18.5'],
      ],
      guideImage: null,
      version: 1,
    }),
    insert('sizeCharts', {
      id: id('SZC', 3),
      name: "Men's Footwear (UK/IN)",
      categoryId: footwear?.id ?? null,
      brandId: null,
      unit: 'cm',
      columns: ['UK/IN', 'EU', 'Foot length'],
      rows: [
        ['6', '40', '24.5'],
        ['7', '41', '25.4'],
        ['8', '42', '26.2'],
        ['9', '43', '27.1'],
        ['10', '44', '27.9'],
      ],
      guideImage: null,
      version: 1,
    }),
  ];
}

/** Buy-box rule weights and the Arise Assured thresholds (M3.9), stored alongside the dashboard's own doc in `settings`. */
export function seedBuyBoxRules() {
  return insert('settings', {
    id: 'buyBoxRules',
    weights: DEFAULT_WEIGHTS,
    ariseAssured: DEFAULT_ARISE_ASSURED,
    version: 1,
    updatedAt: mockNowIso(),
    updatedByName: 'System',
  });
}
