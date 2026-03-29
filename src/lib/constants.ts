import { Sofa, Bed, UtensilsCrossed, Zap, TreePine, Baby, Briefcase, ShoppingBag } from 'lucide-react';

export const CATEGORIES = [
  {
    name: 'Living Room & Lounge',
    slug: 'living-room-lounge',
    description: 'Sofas, coffee tables, TV stands, shelves, mirrors, carpets, curtains, decor',
    icon: Sofa,
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Bedroom & Sleep',
    slug: 'bedroom-sleep',
    description: 'Beds, mattresses, wardrobes, drawers, pillows, blankets',
    icon: Bed,
    image: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Kitchen & Dining',
    slug: 'kitchen-dining',
    description: 'Dining sets, dining tables, chairs, pots, pans, kitchen items',
    icon: UtensilsCrossed,
    image: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Appliances',
    slug: 'appliances',
    description: 'Fridges, washing machines, ACs, microwaves, stoves, blenders, water dispensers, fans, TVs',
    icon: Zap,
    image: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Outdoor & Garden',
    slug: 'outdoor-garden',
    description: 'Garden sets, chairs, tables, BBQs, camping, pet houses, storage sheds',
    icon: TreePine,
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Kids & Baby',
    slug: 'kids-baby',
    description: 'Baby beds, trolleys, bunk beds, toys, car seats, bikes, study tables, cycles',
    icon: Baby,
    image: 'https://images.unsplash.com/photo-1566004100477-7b3d6e09d88a?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Office, Study & Fitness',
    slug: 'office-study-fitness',
    description: 'Office chairs & tables, laptops, exercise machines, treadmills, dumbbells',
    icon: Briefcase,
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=400&fit=crop&q=80',
  },
  {
    name: 'Everyday Essentials',
    slug: 'everyday-essentials',
    description: 'Bags, clothes, shoes, books, baskets, small accessories, misc',
    icon: ShoppingBag,
    image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=400&fit=crop&q=80',
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
