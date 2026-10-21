import { db } from '../db/store';

/**
 * Shapes a home layout version into the JSON the app actually consumes.
 *
 * This is the exit criterion for Phase 5: "home layout publishes a JSON the
 * app can consume." The admin's internal version record carries scheduling
 * and audit fields the app has no use for, so this strips it down to exactly
 * what `HomeScreen` would render — section type, its config, and visibility —
 * plus the category and brand tabs it reads alongside the layout.
 */
export function toAppJson(version) {
  return {
    publishedAt: version.publishedAt,
    version: version.id,
    sections: version.sections
      .filter((s) => s.visibility?.enabled !== false)
      .map((s) => ({
        type: s.type,
        config: s.config,
        visibility: s.visibility ?? { enabled: true },
      })),
    categoryTabs: db.categoryTabs
      .filter((t) => t.active)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ label: t.label, icon: t.icon, gradient: t.gradient, layoutVariant: t.layoutVariant })),
    topBrandTabs: db.topBrandTabs
      .filter((t) => t.active)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ label: t.label, logo: t.logo, target: t.target })),
  };
}

export const HOME_SECTION_TYPES = [
  'HERO_BANNER_CAROUSEL',
  'AD_SHEET_CARD',
  'RECENTLY_VIEWED_RAIL',
  'FLASH_SALE_BANNER',
  'AD_TILE_ROW',
  'SUGGESTED_FOR_YOU',
  'BRANDS_SPOTLIGHT',
  'TOP_VALUE_DEALS',
  'PRODUCT_FEED',
  'SPONSORED_RAIL',
];
