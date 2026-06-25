import { Sofa, Bed, UtensilsCrossed, Zap, TreePine, Baby, Briefcase, ShoppingBag, Shirt, Lamp, Home } from 'lucide-react';
import type { ShopItem } from './supabase';
import { resolvePublicItemFields } from './resolve-public-item-fields';
import { getShop } from './shops';
import { getEffectivePrice } from './effective-fields';

export const CATEGORIES = [
  {
    name: 'Sofas & Seating',
    slug: 'sofas-seating',
    description: 'Sofas, coffee tables, TV stands, shelves, mirrors, carpets, curtains, decor',
    icon: Sofa,
    image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Beds & Mattresses',
    slug: 'beds-mattresses',
    description: 'Beds, mattresses, wardrobes, drawers, pillows, blankets',
    icon: Bed,
    image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Wardrobes & Storage',
    slug: 'wardrobes-storage',
    description: 'Wardrobes, cupboards, and clothes storage cabinets for every bedroom',
    icon: Shirt,
    // PLACEHOLDER image — reuses the Bedroom Unsplash photo until a dedicated one is supplied.
    image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Bedroom Furniture',
    slug: 'bedroom-furniture',
    description: 'Nightstands, bedside tables, dressers, chests of drawers, and dressing tables',
    icon: Lamp,
    // PLACEHOLDER image — reuses the Bedroom Unsplash photo until a dedicated one is supplied.
    image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Dining & Kitchen',
    slug: 'dining-kitchen',
    description: 'Dining sets, dining tables, chairs, pots, pans, kitchen items',
    icon: UtensilsCrossed,
    image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Appliances',
    slug: 'appliances',
    description: 'Fridges, washing machines, ACs, microwaves, stoves, blenders, water dispensers, fans, TVs',
    icon: Zap,
    image: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Office & Fitness',
    slug: 'office-fitness',
    description: 'Office chairs & tables, laptops, exercise machines, treadmills, dumbbells',
    icon: Briefcase,
    image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Kids & Baby',
    slug: 'kids-baby',
    description: 'Baby beds, trolleys, bunk beds, toys, car seats, bikes, study tables, cycles',
    icon: Baby,
    image: 'https://images.unsplash.com/photo-1540479859555-17af45c78602?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Outdoor & Garden',
    slug: 'outdoor-garden',
    description: 'Garden sets, chairs, tables, BBQs, camping, pet houses, storage sheds',
    icon: TreePine,
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Shoe Racks & Shelves',
    slug: 'shoe-racks-shelves',
    description: 'Bags, clothes, shoes, books, baskets, small accessories, misc',
    icon: ShoppingBag,
    image: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Everyday Essentials',
    slug: 'everyday-essentials',
    description: 'Lamps, mirrors, rugs, decor, and everyday home items',
    icon: Home,
    image: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=600&h=400&fit=crop&q=80',
  },
];

// Related-categories strip (static config — no DB). Keyed by canonical category
// name (the published_category value / CATEGORIES[].name). Each value is an
// ordered list of sibling category names to surface as a "You might also like"
// strip on that category's page. Names must match CATEGORIES[].name exactly so
// the component can resolve each to its slug.
export const RELATED_CATEGORIES: Record<string, string[]> = {
  'Sofas & Seating':     ['Bedroom Furniture', 'Dining & Kitchen', 'Office & Fitness'],
  'Beds & Mattresses':   ['Bedroom Furniture', 'Wardrobes & Storage', 'Kids & Baby'],
  'Bedroom Furniture':   ['Beds & Mattresses', 'Wardrobes & Storage', 'Sofas & Seating'],
  'Wardrobes & Storage': ['Bedroom Furniture', 'Shoe Racks & Shelves', 'Dining & Kitchen'],
  'Dining & Kitchen':    ['Sofas & Seating', 'Appliances', 'Bedroom Furniture'],
  'Appliances':          ['Dining & Kitchen', 'Office & Fitness', 'Bedroom Furniture'],
  'Office & Fitness':    ['Sofas & Seating', 'Appliances', 'Bedroom Furniture'],
  'Kids & Baby':         ['Beds & Mattresses', 'Bedroom Furniture', 'Sofas & Seating'],
  'Outdoor & Garden':    ['Sofas & Seating', 'Dining & Kitchen', 'Office & Fitness'],
  'Shoe Racks & Shelves':['Wardrobes & Storage', 'Bedroom Furniture', 'Everyday Essentials'],
  'Everyday Essentials': ['Shoe Racks & Shelves', 'Dining & Kitchen', 'Sofas & Seating'],
};

export const SHOPS = [
  { id: 'A', name: 'Shop A' },
  { id: 'B', name: 'Shop B' },
  { id: 'C', name: 'Shop C' },
  { id: 'D', name: 'Shop D' },
  { id: 'E', name: 'Shop E' },
];

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '971585932499';

// PR #12: prefill format depends on the negotiable flag.
// - true (default): "and want to negotiate" — keeps the existing tone
// - false: neutral "saw this on bufaisal.ae" opener
// Then both versions append the same emoji block (item / price / shop /
// barcode), with each line skipped if the underlying value is missing.
//
// Phase 6.5b.1: takes a full ShopItem and routes text reads through
// resolvePublicItemFields / canonical admin_*?? worker_* / ai_*
// columns rather than the legacy mirrors.
export function buildWhatsAppUrl(item: ShopItem) {
  const f = resolvePublicItemFields(item);
  const shop = getShop(item.worker_shop_id);
  const negotiable = item.admin_negotiable ?? item.worker_negotiable;
  const isNegotiable = negotiable !== false;
  const opener = isNegotiable
    ? 'Hi! I saw this on bufaisal.ae and want to negotiate. Is it still available?'
    : 'Hi! I saw this on bufaisal.ae. Is it still available?';

  const lines: string[] = [opener, ''];
  if (f.itemName) {
    lines.push(`📦 ${f.itemName}`);
  }
  const effectivePrice = getEffectivePrice(item);
  if (effectivePrice && effectivePrice > 0) {
    lines.push(`💰 ${effectivePrice} AED`);
  }
  if (shop?.displayName) {
    lines.push(`📍 ${shop.displayName}`);
  }
  if (item.ai_barcode_extracted) {
    lines.push(`🔖 ${item.ai_barcode_extracted}`);
  }
  lines.push('', `https://bufaisal.ae/item/${item.id}`);

  const message = lines.join('\n');
  return `https://wa.me/971558812411?text=${encodeURIComponent(message)}`;
}

export function getWhatsAppGeneralUrl() {
  return `https://wa.me/971558812411?text=Hey%2C%20I%27m%20interested%20in%20this.%20Is%20it%20available%3F`;
}

export const CATEGORY_SLUG_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.name])
);

// Backward-compat slug aliases (2026-06-21 category rename). Old slugs were
// indexed by Google and live in existing links/bookmarks; map each to its new
// canonical slug so `?category=<old>` still resolves to the right category.
// The new slug is canonical everywhere (navbar links, metadata canonical URLs).
// Only the 5 renamed categories appear here — Appliances, Kids & Baby, and
// Outdoor & Garden kept their slugs.
export const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  'living-room-lounge': 'living-room',
  'bedroom-sleep': 'bedroom',
  'kitchen-dining': 'dining-kitchen',
  'office-study-fitness': 'office-fitness',
  // 2026-06-22 category split. The 2026-06-21 slugs `living-room` and `bedroom`
  // are no longer real categories — they now alias into the split taxonomy.
  // Chains form (e.g. `bedroom-sleep` → `bedroom` → `bedroom-furniture`), so
  // resolveCategorySlug below follows up to 2 hops.
  // ('everyday-essentials' is intentionally absent now — it became a real
  //  category in the same split, so its slug must resolve to itself.)
  'bedroom': 'bedroom-furniture',
  'living-room': 'sofas-seating',
};

// Normalize an incoming URL category slug to its canonical form. Follows the
// alias chain up to 2 hops so pre-2026-06-21 slugs still resolve through the
// intermediate 2026-06-21 slug into the 2026-06-22 split taxonomy (e.g.
// `bedroom-sleep` → `bedroom` → `bedroom-furniture`). The `seen` set guards
// against a cyclic alias definition. Use this before any CATEGORY_SLUG_MAP
// lookup so old indexed links keep working.
export function resolveCategorySlug(slug: string | undefined | null): string {
  if (!slug) return '';
  let current = slug;
  const seen = new Set<string>([current]);
  for (let hops = 0; hops < 2; hops++) {
    const next = CATEGORY_SLUG_ALIASES[current];
    if (!next || seen.has(next)) break;
    current = next;
    seen.add(current);
  }
  return current;
}

// Public shop/home grid pagination size. Initial SSR load fetches this many,
// each "Load More" tap fetches the next page of this size. Shared by the SSR
// fetchers (page.tsx, shop/page.tsx) and the client refetch in shop-client.tsx
// so offsets line up.
export const SHOP_PAGE_SIZE = 50;
