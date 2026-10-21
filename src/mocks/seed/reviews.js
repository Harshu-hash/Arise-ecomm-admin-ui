import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { autoModerationResult } from '../engine/reviews';
import { mockNow } from '../engine/settings';

/** Reviews & Q&A (M13): drawn from real delivered order items, so a review's "certified buyer" flag is true. */

const CLEAN_REVIEWS = [
  'Good quality fabric, fits true to size, arrived on time.',
  'Exactly as described. Would buy again.',
  'Packaging was excellent and the product works great so far.',
  'Decent for the price, nothing extraordinary but does the job.',
  'Colour was slightly different from the photos but overall happy.',
  'Fast delivery, product matches the listing.',
];
const FLAGGED_REVIEWS = [
  'This is a damn terrible seller, avoid at all costs',
  'Call me on 9876543210 if you want the real review',
  'Visit my channel www.example.com for the full unboxing',
  'They sent me this to review in exchange for a discount',
  'ok',
];

export function seedReviews() {
  const delivered = filter('orderItems', (i) => i.status === 'DELIVERED').slice(0, 220);
  const rows = [];

  delivered.forEach((item, i) => {
    const order = db.orders.find((o) => o.id === item.orderId);
    const customer = db.customers.find((c) => c.id === order?.customerId);
    if (!order || !customer) return;

    const flagged = i % 9 === 0;
    const text = flagged ? FLAGGED_REVIEWS[i % FLAGGED_REVIEWS.length] : CLEAN_REVIEWS[i % CLEAN_REVIEWS.length];
    const mediaCount = i % 6 === 0 ? faker.number.int({ min: 1, max: 3 }) : 0;
    const { classification, autoPublishable } = autoModerationResult({ text, certifiedBuyer: true, mediaCount });

    const userFlagged = i % 17 === 0;
    const status = autoPublishable ? 'PUBLISHED' : userFlagged ? 'FLAGGED' : 'PENDING';

    const review = insert('reviews', {
      id: id('REV', 6),
      productId: item.productId,
      productTitle: item.name,
      orderId: order.id,
      orderItemId: item.id,
      customerId: customer.id,
      customerName: customer.name,
      certifiedBuyer: true,
      rating: flagged ? faker.number.int({ min: 1, max: 3 }) : faker.number.int({ min: 3, max: 5 }),
      title: flagged ? 'Disappointed' : 'Happy with this purchase',
      text,
      variantLabel: item.variantLabel,
      mediaCount,
      media: Array.from({ length: mediaCount }, (_, n) => `review-photo-${n + 1}.jpg`),
      helpfulVotes: faker.number.int({ min: 0, max: 400 }),
      autoModeration: classification,
      status,
      moderationReason: null,
      incentivised: classification === 'INCENTIVISED',
      submittedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 90 }) * 86400_000).toISOString(),
      version: 1,
    });
    rows.push(review);

    if (userFlagged) {
      insert('abuseReports', {
        id: id('ABR', 5),
        targetType: 'REVIEW',
        targetId: review.id,
        targetExcerpt: review.text.slice(0, 80),
        reason: classification === 'PROFANITY' ? 'Abusive language' : 'Suspicious / fake review',
        reporterCount: faker.number.int({ min: 1, max: 6 }),
        status: 'OPEN',
        reportedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 10 }) * 86400_000).toISOString(),
      });
    }
  });

  return rows;
}

const QUESTIONS = [
  'Is this true to size or should I size up?',
  'Does this come with a warranty card?',
  'What is the battery life like with regular use?',
  'Is Cash on Delivery available for this product?',
  'Can this be returned if it does not fit?',
];
const ANSWERS = [
  'Yes, true to size based on my experience.',
  'It runs a little small, I would size up.',
  'Battery lasted about 2 days with moderate use for me.',
];

export function seedQuestions() {
  const products = filter('products', (p) => p.status === 'LIVE').slice(0, 60);
  const customers = db.customers.filter((c) => c.status === 'ACTIVE');

  return products.map((product, i) => {
    const asker = customers[i % customers.length];
    const question = insert('questions', {
      id: id('QST', 6),
      productId: product.id,
      productTitle: product.title,
      customerId: asker.id,
      customerName: asker.name,
      text: QUESTIONS[i % QUESTIONS.length],
      status: i % 13 === 0 ? 'FLAGGED' : 'PUBLISHED',
      askedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 60 }) * 86400_000).toISOString(),
      version: 1,
    });

    // Most questions get at least one answer; some sit open past the nudge window.
    const unanswered = i % 7 === 0;
    if (!unanswered) {
      const answerer = i % 4 === 0
        ? { type: 'SELLER', name: db.sellers.find((s) => s.status === 'ACTIVE')?.storeName ?? 'Seller' }
        : i % 11 === 0
          ? { type: 'ARISE', name: 'Arise Support' }
          : { type: 'CUSTOMER', name: customers[(i + 3) % customers.length].name };

      insert('answers', {
        id: id('ANS', 7),
        questionId: question.id,
        authorType: answerer.type,
        authorName: answerer.name,
        text: ANSWERS[i % ANSWERS.length],
        helpfulVotes: faker.number.int({ min: 0, max: 120 }),
        status: 'PUBLISHED',
        answeredAt: new Date(new Date(question.askedAt).getTime() + faker.number.int({ min: 1, max: 5 }) * 86400_000).toISOString(),
      });
    }

    return question;
  });
}
