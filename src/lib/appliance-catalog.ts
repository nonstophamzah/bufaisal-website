// Centralized catalog for the appliance tracker.
// Used by shop/in and manager pages. Keep in sync when adding new brands/types.

export const PRODUCT_TYPES = [
  '🧊 Refrigerator',
  '🫧 Washing Machine',
  '🍽️ Dishwasher',
  '❄️ Freezer',
  '📡 Microwave',
  '🔥 Gas Stove',
  '⚡ Electric Stove',
  '💨 Clothes Dryer',
  '💧 Water Cooler',
  '🔥 Oven',
  '🌬️ Air Water Cooler',
  '📦 Other',
];

// 90 brands, alphabetized A–Z. OTHER is intentionally pinned to the end
// so it doesn't get lost in the middle of the dropdown.
export const BRANDS = [
  'AARDEE',
  'ADMIRAL',
  'AEG',
  'AFTERON',
  'AKAI',
  'ARCELIK',
  'ARISTON',
  'ASSET',
  'BEKO',
  'BLOMBERG',
  'BOOMPANI',
  'BOSCH',
  'BOSCHE',
  'CALFREDDOM',
  'CANDY',
  'CIQ',
  'CKON',
  'CLASSIC',
  'DAEWOO',
  'DENIKA',
  'DOLPHIN',
  'EKSLA',
  'ELBA',
  'ELECTROLUX',
  'ELECTROLX',
  'ELEKTA',
  'ENERALTEC',
  'EUROPA',
  'FANGTIN',
  'FISHER & PAYKEL',
  'FRIGIDAIRE',
  'FROST',
  'FWL1',
  'GEEPAS',
  'GENERALLTEC',
  'GERMANIA',
  'GGIBSON',
  'GIBSON',
  'GLIMGAS',
  'GORENJE',
  'GRATUS',
  'HILTON',
  'HISENSE',
  'HITACHI',
  'HOVER',
  'IGNIS',
  'IKON',
  'INDESIT',
  'KAROCHE',
  'KATOMA',
  'KENWOOD',
  'KERPTON',
  'KKROME',
  'KLESS',
  'KODAMA',
  'KRYPTON',
  'LG',
  'MEGA',
  'MIDEA',
  'MIELE',
  'MYCHOICE',
  'NATIONAL',
  'NIKIA',
  'NO NAME',
  'NOBEL',
  'OCTUS',
  'OISIS',
  'OLESNMARK',
  'PANASONIC',
  'PAOPAT',
  'PHILCO',
  'PHILIPS',
  'POWER 7',
  'PRINCESS',
  'SAMSUNG',
  'SANFORD',
  'SANSUI',
  'SANYO',
  'SIEMENS',
  'SONASHI',
  'SUPER GENERAL',
  'SUPERIOR',
  'SURE',
  'TCL',
  'TEKA',
  'TERIM',
  'TOSHIBA',
  'TROPICALIZED',
  'VESTLE',
  'WANSA',
  'WESTPOINT',
  'WHIRLPOOL',
  'WOLF',
  'ZANUSI',
  'OTHER',
];

export const PRODUCT_OTHER = '📦 Other';
export const BRAND_OTHER = 'OTHER';

// ─────────────────────────────────────────────────────────────
// Legacy value mapping
// Old DB rows predate the emoji-prefixed catalog. These helpers
// translate legacy values to the canonical catalog entry so old
// items display correctly in the dashboard.
// ─────────────────────────────────────────────────────────────

const LEGACY_PRODUCT_MAP: Record<string, string> = {
  'Fridge': '🧊 Refrigerator',
  'Washer': '🫧 Washing Machine',
  'Oven': '🔥 Oven',
  'Microwave': '📡 Microwave',
  'AC / Cooler': '🌬️ Air Water Cooler',
  'Other': '📦 Other',
};

/**
 * Map a product_type value (possibly a legacy entry) to its canonical
 * catalog form. Unknown values are returned unchanged so custom
 * "Other" entries still display.
 */
export function canonicalProductType(value: string | null | undefined): string {
  if (!value) return '';
  return LEGACY_PRODUCT_MAP[value] ?? value;
}

// Case-insensitive brand lookup built once from BRANDS.
const BRAND_LOOKUP: Record<string, string> = BRANDS.reduce((acc, b) => {
  acc[b.toLowerCase()] = b;
  return acc;
}, {} as Record<string, string>);

/**
 * Map a brand value to its canonical catalog form via case-insensitive
 * match. Unknown values are returned unchanged so custom brands still
 * display.
 */
export function canonicalBrand(value: string | null | undefined): string {
  if (!value) return '';
  return BRAND_LOOKUP[value.toLowerCase()] ?? value;
}
