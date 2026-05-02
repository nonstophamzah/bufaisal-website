'use client';

import { Clock, Store, Truck, SearchCheck, Zap } from 'lucide-react';
import { useLang } from '@/lib/lang';

const ITEMS = [
  { Icon: Clock, en: 'Since 2009', ar: 'منذ ٢٠٠٩' },
  { Icon: Store, en: '5 Showrooms in Ajman', ar: '٥ صالات في عجمان' },
  { Icon: Truck, en: 'Delivery in All Emirates', ar: 'توصيل لجميع الإمارات' },
  { Icon: SearchCheck, en: 'All Items Inspected', ar: 'جميع المنتجات مفحوصة' },
  { Icon: Zap, en: '24-48hr Delivery', ar: 'توصيل خلال ٢٤-٤٨ ساعة' },
];

export default function TrustStrip() {
  const { t } = useLang();
  return (
    <div className="w-full bg-yellow text-black border-y border-black/10">
      <div className="max-w-7xl mx-auto overflow-x-auto hide-scrollbar">
        <ul className="flex items-center md:justify-between gap-5 md:gap-3 px-3 md:px-4 py-1.5 min-w-max md:min-w-0">
          {ITEMS.map(({ Icon, en, ar }) => (
            <li
              key={en}
              className="flex items-center gap-1.5 whitespace-nowrap text-[11px] md:text-xs font-bold"
            >
              <Icon size={13} strokeWidth={2.5} className="flex-shrink-0" aria-hidden="true" />
              <span>{t(en, ar)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
