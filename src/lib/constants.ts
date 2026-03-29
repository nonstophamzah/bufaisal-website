import { Sofa, Bed, UtensilsCrossed, Zap, Palette, Shirt, Star } from 'lucide-react';

export const CATEGORIES = [
  {
    name: 'Living Room',
    slug: 'living-room',
    description: 'Sofas, tables, TV stands, and more',
    icon: Sofa,
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Bedroom',
    slug: 'bedroom',
    description: 'Beds, wardrobes, dressers, and nightstands',
    icon: Bed,
    image: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Dining & Kitchen',
    slug: 'dining-kitchen',
    description: 'Dining sets, kitchen essentials, and cookware',
    icon: UtensilsCrossed,
    image: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Appliances',
    slug: 'appliances',
    description: 'Washing machines, fridges, ACs, and more',
    icon: Zap,
    image: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Decor & Furnishing',
    slug: 'decor-furnishing',
    description: 'Curtains, rugs, lamps, and decorative items',
    icon: Palette,
    image: 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Clothing',
    slug: 'clothing',
    description: 'Pre-loved clothing and accessories',
    icon: Shirt,
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Specialty Items',
    slug: 'specialty-items',
    description: 'Unique finds, antiques, and collectibles',
    icon: Star,
    image: 'https://images.unsplash.com/photo-1513519245088-0e12902e35ca?w=600&h=400&fit=crop&q=80',
  },
];

export const SHOPS = [
  { id: 'A', name: 'Shop A' },
  { id: 'B', name: 'Shop B' },
  { id: 'C', name: 'Shop C' },
  { id: 'D', name: 'Shop D' },
  { id: 'E', name: 'Shop E' },
];

export function buildWhatsAppUrl(item: {
  id?: string;
  item_name: string;
  shop_source?: string | null;
}) {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '';
  const shopText = item.shop_source ? ` at ${item.shop_source}` : '';
  const lines = [
    `Hi, I'm interested in *${item.item_name}*${shopText}. Is this still available?`,
  ];
  if (item.id) {
    lines.push(`View: https://bufaisal.ae/item/${item.id}`);
  }
  const message = lines.join('\n');
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const CATEGORY_SLUG_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.name])
);
