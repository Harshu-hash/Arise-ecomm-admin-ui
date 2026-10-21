import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, id, insert } from '../db/store';
import { isAriseAssured, rankOffers } from '../engine/buyBox';
import { mockNow } from '../engine/settings';

/**
 * Products, their variants and the per-seller offers on them.
 *
 * The model is a shared catalog page with many sellers competing on it — the
 * mobile app's "Sold By X · See other sellers" row — so a product has variants
 * (size × colour) and each variant has one offer per seller, with a buy-box
 * winner chosen between them.
 */

const IMG = (photoId, w = 600) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${w}&q=80`;

/** Titles reuse the mobile app's mock catalog so both products tell one story. */
const CATALOG = [
  ['boAt Airdopes 141 Bluetooth Truly Wireless Earbuds', 'boAt', 'True Wireless Earbuds', 129900, 249000, 'photo-1590658268037-6bf12165a8df'],
  ['boAt Rockerz 450 Bluetooth Headphones', 'boAt', 'Headphones', 79900, 299900, 'photo-1590658268037-6bf12165a8df'],
  ['Noise ColorFit Pro Smartwatch', 'Noise', 'Smartwatches', 129900, 499900, 'photo-1523275335684-37898b6baf30'],
  ['Mi Power Bank 20000mAh', 'Mi', 'Power Banks', 109900, 249900, 'photo-1608043152269-423dbba4e7e1'],
  ['FOXBOOM Bluetooth Speaker', 'Norvex', 'Bluetooth Speakers', 21500, 39900, 'photo-1608043152269-423dbba4e7e1'],
  ['Beyoung Men Casual Shirt', 'Beyoung', 'Shirts', 91500, 249900, 'photo-1602810318383-e386cc2a3ccf'],
  ['Roadster Men Slim Fit Shirt', 'Roadster', 'Shirts', 74900, 179900, 'photo-1589310243389-96a5483213a8'],
  ['KAJARU Pack of 2 Men Self Design Sweater', 'KAJARU', 'T-Shirts', 54000, 129900, 'photo-1620799140408-edc6dcb6d633'],
  ['HRX Men Casual Shirt', 'HRX', 'Shirts', 89900, 199900, 'photo-1598033129183-c4f50c736f10'],
  ['Zeba Cotton Kurti', 'Layasa', 'Kurtis', 20700, 99900, 'photo-1594633312681-425c7b97ccd1'],
  ['Puma Men Running Shoes', 'Puma', 'Footwear', 99900, 349900, 'photo-1542291026-7eec264c27ff'],
  ['Vantiel Croc-Textured Loafers', 'Roadster', 'Footwear', 89900, 199900, 'photo-1600185365483-26d7a4cc7519'],
  ['Wildcraft Travel Backpack 35L', 'Wildcraft', 'Backpacks', 89900, 219900, 'photo-1553062407-98eeb64c6a62'],
  ['Wildcraft Sling Bag', 'Wildcraft', 'Waist Bags', 49900, 119900, 'photo-1591047139829-d91aecb6caea'],
  ['TVS Full Face Helmet', 'TVS', 'Helmets', 149900, 299900, 'photo-1591637333184-19aa84b3e01f'],
  ['Fastrack Analog Wrist Watch', 'Fastrack', 'Smartwatches', 11800, 69900, 'photo-1524805444758-089113d48a6d'],
  ['Prestige Non-stick Cookware Set', 'Prestige', 'Cookware', 149900, 399900, 'photo-1601758228041-f3b2795255f1'],
  ['Purelume Ceramic Coffee Mug Set of 2', 'Purelume', 'Mugs & Cups', 34900, 89900, 'photo-1517705008128-361805f42e86'],
  ['Glowline LED Desk Lamp with USB Charging', 'Glowline', 'Desk Lamps', 59900, 149900, 'photo-1507473885765-e6ed057f782c'],
  ['Denver Deodorant Body Spray', 'Denver', 'Deodorants', 19900, 29900, 'photo-1523293182086-7651a899d37f'],
  ['Maggi 2-Minute Noodles, Pack of 12', 'Maggi', 'Noodles & Pasta', 14400, 16800, 'photo-1612929633738-8fe44f7ec841'],
  ['Drools Adult Dog Food 3kg', 'Drools', 'Pet Food', 74900, 99900, 'photo-1568640347023-a616a30bc3bd'],
  ['Huggables Giant Teddy Bear Soft Toy', 'Huggables', 'Soft Toys', 79900, 179900, 'photo-1538292999061-16ca3647ab1c'],
  ['SEMANGAT Keep On Going Notebook Diary', 'SEMANGAT', 'Notebooks & Diaries', 20000, 39900, 'photo-1517842645767-c639042777db'],
];

const APPAREL_CATEGORIES = ['Shirts', 'T-Shirts', 'Kurtis', 'Footwear'];
const COLOURS = ['Maroon', 'Blue', 'Black', 'Grey'];
const SIZES = ['38', '40', '42', '44', '46'];

/** Spread of listing states so the QC queue and every tab have rows. */
function statusFor(i) {
  if (i % 11 === 0) return 'QC_PENDING';
  if (i % 13 === 0) return 'NEEDS_CHANGES';
  if (i % 17 === 0) return 'INACTIVE';
  if (i % 19 === 0) return 'BLOCKED';
  return 'LIVE';
}

function contentScore(product) {
  // A rough completeness measure, the same way a real catalog team scores it.
  let score = 40;
  if (product.description?.length > 80) score += 15;
  if (product.highlights?.length >= 3) score += 15;
  if (Object.keys(product.attributes ?? {}).length >= 4) score += 20;
  if (product.sizeChartId) score += 10;
  return Math.min(100, score);
}

export function seedProducts() {
  const activeSellers = db.sellers.filter((s) => s.status === 'ACTIVE');
  const leafByName = (name) => db.categories.find((c) => c.level === 3 && c.name === name);
  const brandByName = (name) => db.brands.find((b) => b.name === name);
  const shirtChart = db.sizeCharts.find((c) => c.name.includes('Shirts'));

  const products = [];

  CATALOG.forEach((entry, i) => {
    const [title, brandName, categoryName, pricePaise, mrpPaise, photoId] = entry;
    const category = leafByName(categoryName);
    const brand = brandByName(brandName);
    if (!category) return;

    const isApparel = APPAREL_CATEGORIES.includes(categoryName);
    const status = statusFor(i);

    const product = insert('products', {
      // Flipkart-style catalog id; searchable in the command palette.
      id: `FSN${String(100000 + i * 37)}`,
      title,
      brandId: brand?.id ?? null,
      brandName,
      categoryId: category.id,
      categoryPath: `${category.rootName} › ${category.name}`,
      status,
      description: `${title} — ${faker.commerce.productDescription()}`,
      highlights: [
        `${brandName} quality assurance`,
        isApparel ? 'Machine washable' : '1 year manufacturer warranty',
        'Free delivery on eligible orders',
      ],
      attributes: isApparel
        ? { fit: 'Regular Fit', fabric: 'Cotton', sleeve_length: 'Full Sleeve', pattern: 'Solid', wash_care: 'Gentle machine wash' }
        : { connectivity: 'Bluetooth 5.3', warranty: '1 year', water_resistance: 'IPX5', battery_life: 42 },
      // Fields the mobile app's product page renders verbatim.
      fit: isApparel ? 'Regular Fit' : null,
      modelInfo: isApparel ? "The model (height 6') is wearing a size 40" : null,
      care: isApparel ? 'Gentle Machine Wash' : null,
      manufacturer: `${brandName} India Pvt Ltd, ${faker.location.city()}`,
      countryOfOrigin: 'India',
      productCode: String(40000000 + i * 1237),
      hsnCode: category.hsnCode,
      gstRate: category.gstRate,
      searchKeywords: [brandName.toLowerCase(), categoryName.toLowerCase()],
      sizeChartId: isApparel && categoryName === 'Shirts' ? (shirtChart?.id ?? null) : null,
      variantDefiningAttrs: isApparel ? ['colour', 'size'] : ['colour'],
      assured: i % 3 === 0,
      rating: status === 'LIVE' ? Number((3.4 + (i % 16) / 10).toFixed(1)) : null,
      ratingCount: status === 'LIVE' ? faker.number.int({ min: 12, max: 18400 }) : 0,
      reviewCount: status === 'LIVE' ? faker.number.int({ min: 4, max: 2600 }) : 0,
      images: [IMG(photoId), IMG(photoId, 800)],
      createdAt: new Date(mockNow() - (120 - i) * 86400_000).toISOString(),
      updatedAt: new Date(mockNow() - faker.number.int({ min: 0, max: 30 }) * 86400_000).toISOString(),
      blockedReason: status === 'BLOCKED' ? 'Price above MRP reported by a customer.' : null,
      version: 1,
    });
    product.contentScore = contentScore(product);
    products.push(product);

    // Variants: colour × size for apparel, colour only otherwise.
    const colours = COLOURS.slice(0, isApparel ? 3 : 2);
    const sizes = isApparel ? SIZES.slice(0, 4) : [null];
    let v = 0;

    for (const colour of colours) {
      for (const size of sizes) {
        v += 1;
        const variant = insert('variants', {
          id: id('VAR', 6),
          productId: product.id,
          sku: `${brandName.toUpperCase().slice(0, 4)}-${product.productCode}-${v}`,
          ean: faker.string.numeric(13),
          attributes: size ? { colour, size } : { colour },
          label: size ? `${colour} · ${size}` : colour,
          images: [IMG(photoId, 400)],
          weightG: isApparel ? faker.number.int({ min: 200, max: 600 }) : faker.number.int({ min: 120, max: 1800 }),
          dimsCm: { l: 25, w: 18, h: 6 },
          status: 'ACTIVE',
          version: 1,
        });

        // Two or three sellers compete on each variant.
        const sellerCount = (i + v) % 3 === 0 ? 3 : 2;
        const offers = [];
        for (let s = 0; s < sellerCount; s += 1) {
          const seller = activeSellers[(i * 7 + v * 3 + s) % activeSellers.length];
          if (!seller) continue;
          const jitter = 1 + (s * 4 - 2) / 100;
          const stock = status === 'LIVE' ? faker.number.int({ min: 0, max: 240 }) : 0;
          offers.push(
            insert('offers', {
              id: id('OFR', 7),
              productId: product.id,
              variantId: variant.id,
              sellerId: seller.id,
              sellerName: seller.storeName,
              sellingPricePaise: Math.round(pricePaise * jitter),
              mrpPaise,
              stock,
              fulfillmentType: seller.fulfillmentTypes.includes('ARISE') && s === 0 ? 'ARISE' : 'SELLER',
              dispatchSlaHours: s === 0 ? 24 : 48,
              status: stock === 0 && status === 'LIVE' ? 'OUT_OF_STOCK' : status,
              buyBoxWinner: false,
              ariseAssured: false,
              version: 1,
            }),
          );
        }

        // Buy box and the Arise Assured badge both follow the published
        // rules (M3.9), the same engine the rules page's own publish and
        // simulate actions call — never a second copy of the formula.
        const rules = db.settings.find((s) => s.id === 'buyBoxRules');
        const sellerById = new Map(activeSellers.map((s) => [s.id, s]));
        const ranked = rankOffers(offers, sellerById, rules.weights);
        if (ranked[0]) {
          db.offers.find((o) => o.id === ranked[0].id).buyBoxWinner = true;
        }
        for (const offer of offers) {
          offer.ariseAssured = isAriseAssured(offer, sellerById.get(offer.sellerId), rules.ariseAssured);
        }
      }
    }
  });

  // One listing priced above MRP, so the QC queue has a genuine hard failure
  // to catch. This is a real and common catch, not a synthetic one.
  const offender = db.offers.find((o) => {
    const p = db.products.find((x) => x.id === o.productId);
    return p?.status === 'QC_PENDING';
  });
  if (offender) offender.sellingPricePaise = offender.mrpPaise + 50000;

  return products;
}

/** The QC work queue: everything awaiting a catalog decision. */
export function seedListingSubmissions() {
  const rows = [];
  const pending = db.products.filter((p) => ['QC_PENDING', 'NEEDS_CHANGES'].includes(p.status));

  // Plus a batch of brand-new submissions so the queue has realistic depth.
  const extra = db.products.filter((p) => p.status === 'LIVE').slice(0, 14);

  [...pending, ...extra].forEach((product, i) => {
    const isRevision = product.status === 'LIVE';
    const offer = db.offers.find((o) => o.productId === product.id);
    const seller = db.sellers.find((s) => s.id === offer?.sellerId);

    rows.push(
      insert('listingSubmissions', {
        id: id('QC', 6),
        productId: product.id,
        productTitle: product.title,
        productImage: product.images[0],
        sellerId: seller?.id ?? null,
        sellerName: seller?.storeName ?? '—',
        sellerTier: seller?.tier ?? 'BRONZE',
        categoryId: product.categoryId,
        categoryPath: product.categoryPath,
        type: isRevision ? 'REVISION' : product.status === 'NEEDS_CHANGES' ? 'RESUBMISSION' : 'NEW',
        status: product.status === 'NEEDS_CHANGES' ? 'NEEDS_CHANGES' : 'QC_PENDING',
        submittedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 96 }) * 3600_000).toISOString(),
        // Platinum sellers and sale-event listings jump the queue.
        priority: seller?.tier === 'PLATINUM' ? 'HIGH' : i % 7 === 0 ? 'HIGH' : 'NORMAL',
        assignedToId: null,
        autoChecks: buildAutoChecks(product),
        issues: [],
        version: 1,
      }),
    );
  });
  return rows;
}

/** The automated pass the reviewer sees before reading anything themselves. */
function buildAutoChecks(product) {
  const offers = db.offers.filter((o) => o.productId === product.id);
  const priceAboveMrp = offers.some((o) => o.sellingPricePaise > o.mrpPaise);
  const missingAttrs = Object.keys(product.attributes ?? {}).length < 4;
  const brand = db.brands.find((b) => b.id === product.brandId);

  return [
    { key: 'mandatory_attributes', label: 'Mandatory attributes present', result: missingAttrs ? 'WARN' : 'PASS',
      detail: missingAttrs ? 'Fewer than 4 attributes filled in.' : null },
    { key: 'image_quality', label: 'Images meet 1000×1000 minimum', result: product.images.length > 1 ? 'PASS' : 'WARN',
      detail: product.images.length > 1 ? null : 'Only one image supplied.' },
    { key: 'price_vs_mrp', label: 'Selling price at or below MRP', result: priceAboveMrp ? 'FAIL' : 'PASS',
      detail: priceAboveMrp ? 'One offer is priced above MRP.' : null },
    { key: 'prohibited_words', label: 'No prohibited keywords', result: 'PASS', detail: null },
    { key: 'duplicate', label: 'No likely duplicate in catalog', result: 'PASS', detail: null },
    { key: 'brand_authorisation', label: 'Brand authorisation on file',
      result: brand?.gated ? 'WARN' : 'PASS',
      detail: brand?.gated ? `${brand.name} is a gated brand — check the seller's authorisation.` : null },
    { key: 'hsn_match', label: 'HSN matches the category', result: product.hsnCode ? 'PASS' : 'FAIL',
      detail: product.hsnCode ? null : 'No HSN code set.' },
  ];
}
