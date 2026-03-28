import { Sofa, Bed, UtensilsCrossed, Zap, Palette, Shirt, Star } from 'lucide-react';

export const CATEGORIES = [
  {
    name: 'Living Room',
    slug: 'living-room',
    description: 'Sofas, tables, TV stands, and more',
    icon: Sofa,
  },
  {
    name: 'Bedroom',
    slug: 'bedroom',
    description: 'Beds, wardrobes, dressers, and nightstands',
    icon: Bed,
  },
  {
    name: 'Dining & Kitchen',
    slug: 'dining-kitchen',
    description: 'Dining sets, kitchen essentials, and cookware',
    icon: UtensilsCrossed,
  },
  {
    name: 'Appliances',
    slug: 'appliances',
    description: 'Washing machines, fridges, ACs, and more',
    icon: Zap,
  },
  {
    name: 'Decor & Furnishing',
    slug: 'decor-furnishing',
    description: 'Curtains, rugs, lamps, and decorative items',
    icon: Palette,
  },
  {
    name: 'Clothing',
    slug: 'clothing',
    description: 'Pre-loved clothing and accessories',
    icon: Shirt,
  },
  {
    name: 'Specialty Items',
    slug: 'specialty-items',
    description: 'Unique finds, antiques, and collectibles',
    icon: Star,
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
  item_name: string;
  sale_price: number;
  category: string;
  barcode?: string | null;
  shop_source?: string | null;
}) {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '';
  const message = [
    `Hi! I'm interested in this item from Bu Faisal:`,
    ``,
    `*${item.item_name}*`,
    `Price: AED ${item.sale_price}`,
    `Category: ${item.category}`,
    item.barcode ? `Barcode: ${item.barcode}` : '',
    item.shop_source ? `Shop: ${item.shop_source}` : '',
    ``,
    `Is this still available?`,
  ]
    .filter(Boolean)
    .join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const CATEGORY_SLUG_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.name])
);
