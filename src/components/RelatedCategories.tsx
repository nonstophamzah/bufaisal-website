'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CATEGORIES, RELATED_CATEGORIES } from '@/lib/constants';

// "You might also like" strip for category pages. Static config-driven (no DB):
// looks up RELATED_CATEGORIES[currentCategory], resolves each related category
// name to its slug via CATEGORIES, and renders a horizontal scrollable strip of
// cards linking to /shop?category=<slug>. Renders nothing when the current
// category has no related entries (e.g. the unfiltered /shop or homepage feed).
export default function RelatedCategories({
  currentCategory,
}: {
  currentCategory: string;
}) {
  const related = RELATED_CATEGORIES[currentCategory];
  if (!related || related.length === 0) return null;

  // Resolve each related name to its CATEGORIES entry (for the slug + icon).
  // Drop any that don't resolve so a typo can't render a broken link.
  const cards = related
    .map((name) => CATEGORIES.find((c) => c.name === name))
    .filter((c): c is (typeof CATEGORIES)[number] => Boolean(c));

  if (cards.length === 0) return null;

  return (
    <section className="mt-16" aria-labelledby="related-categories-heading">
      <h2
        id="related-categories-heading"
        className="font-heading text-2xl md:text-3xl mb-5"
      >
        YOU MIGHT ALSO <span className="text-yellow">LIKE</span>
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar [mask-image:linear-gradient(to_right,black_92%,transparent_100%)]">
        {cards.map((cat) => {
          const Icon = cat.icon;
          return (
            <Link
              key={cat.slug}
              href={`/shop?category=${cat.slug}`}
              className="group flex-shrink-0 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 text-black transition-colors hover:bg-[#F9D923] hover:border-[#F9D923]"
            >
              <Icon
                size={20}
                className="flex-shrink-0 text-gray-500 transition-colors group-hover:text-black"
              />
              <span className="font-semibold text-sm whitespace-nowrap">
                {cat.name}
              </span>
              <ChevronRight
                size={16}
                className="flex-shrink-0 text-gray-400 transition-colors group-hover:text-black"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
