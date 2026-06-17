import { Sofa, Bed, UtensilsCrossed, Zap, TreePine, Baby, Briefcase, ShoppingBag } from 'lucide-react';
import type { ShopItem } from './supabase';
import { resolvePublicItemFields } from './resolve-public-item-fields';
import { getShop } from './shops';
import { getEffectivePrice } from './effective-fields';

export const CATEGORIES = [
  {
    name: 'Living Room & Lounge',
    slug: 'living-room-lounge',
    description: 'Sofas, coffee tables, TV stands, shelves, mirrors, carpets, curtains, decor',
    icon: Sofa,
    image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Bedroom & Sleep',
    slug: 'bedroom-sleep',
    description: 'Beds, mattresses, wardrobes, drawers, pillows, blankets',
    icon: Bed,
    image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Kitchen & Dining',
    slug: 'kitchen-dining',
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
    name: 'Outdoor & Garden',
    slug: 'outdoor-garden',
    description: 'Garden sets, chairs, tables, BBQs, camping, pet houses, storage sheds',
    icon: TreePine,
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Kids & Baby',
    slug: 'kids-baby',
    description: 'Baby beds, trolleys, bunk beds, toys, car seats, bikes, study tables, cycles',
    icon: Baby,
    image: 'https://images.unsplash.com/photo-1540479859555-17af45c78602?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Office, Study & Fitness',
    slug: 'office-study-fitness',
    description: 'Office chairs & tables, laptops, exercise machines, treadmills, dumbbells',
    icon: Briefcase,
    image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Everyday Essentials',
    slug: 'everyday-essentials',
    description: 'Bags, clothes, shoes, books, baskets, small accessories, misc',
    icon: ShoppingBag,
    image: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=600&h=400&fit=crop&q=80',
  },
];

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
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function getWhatsAppGeneralUrl() {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi! I have a question about Bu Faisal.')}`;
}

export const CATEGORY_SLUG_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.name])
);

// Public shop/home grid pagination size. Initial SSR load fetches this many,
// each "Load More" tap fetches the next page of this size. Shared by the SSR
// fetchers (page.tsx, shop/page.tsx) and the client refetch in shop-client.tsx
// so offsets line up.
export const SHOP_PAGE_SIZE = 50;
