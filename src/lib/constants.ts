import { Sofa, Bed, UtensilsCrossed, Zap, TreePine, Baby, Briefcase, ShoppingBag } from 'lucide-react';

export const CATEGORIES = [
  {
    name: 'Living Room & Lounge',
    slug: 'living-room-lounge',
    description: 'Sofas, coffee tables, TV stands, shelves, mirrors, carpets, curtains, decor',
    icon: Sofa,
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&h=400&fit=crop&q=80',
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
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Kids & Baby',
    slug: 'kids-baby',
    description: 'Baby beds, trolleys, bunk beds, toys, car seats, bikes, study tables, cycles',
    icon: Baby,
    image: 'https://images.unsplash.com/photo-1519340241574-2cec6aef0c01?w=600&h=400&fit=crop&q=80',
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
    image: 'https://images.unsplash.com/photo-1558171813-01eda89a1e84?w=600&h=400&fit=crop&q=80',
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

export function buildWhatsAppUrl(item: {
  id?: string;
  item_name: string;
  category?: string;
  shop_source?: string | null;
}) {
  const shopText = item.shop_source ? ` at ${item.shop_source}` : '';
  const catText = item.category ? ` (${item.category})` : '';
  const lines = [
    `Hi, I'm interested in *${item.item_name}*${catText}${shopText}. Is this still available?`,
  ];
  if (item.id) {
    lines.push(`View: https://bufaisal.ae/item/${item.id}`);
  }
  const message = lines.join('\n');
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function getWhatsAppGeneralUrl() {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi! I have a question about Bu Faisal.')}`;
}

export const CATEGORY_SLUG_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.name])
);
