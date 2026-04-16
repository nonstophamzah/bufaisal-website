import { Metadata } from 'next';
import CategoryCard from '@/components/CategoryCard';
import { CATEGORIES } from '@/lib/constants';
import { supabase } from '@/lib/supabase';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Browse All Categories | Bu Faisal',
  description:
    'Browse used furniture, appliances, electronics, clothing and more at Bu Faisal. 8 categories of quality second-hand goods across 5 showrooms in Ajman, UAE.',
  alternates: { canonical: '/categories' },
  openGraph: {
    title: 'Browse All Categories | Bu Faisal',
    description: 'Browse used furniture, appliances, electronics, clothing and more at Bu Faisal.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

async function getCategoryCounts() {
  // Parallel queries instead of sequential N+1
  const results = await Promise.all(
    CATEGORIES.map(cat =>
      supabase
        .from('shop_items')
        .select('*', { count: 'exact', head: true })
        .eq('is_published', true)
        .eq('is_sold', false)
        .eq('category', cat.name)
    )
  );
  const counts: Record<string, number> = {};
  CATEGORIES.forEach((cat, i) => {
    counts[cat.slug] = results[i].count || 0;
  });
  return counts;
}

export default async function CategoriesPage() {
  const counts = await getCategoryCounts();

  return (
    <div className="pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-heading text-4xl md:text-5xl mb-2">
          ALL <span className="text-yellow">CATEGORIES</span>
        </h1>
        <p className="text-muted mb-8">
          Browse items organized by category
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.slug}
              name={cat.name}
              slug={cat.slug}
              description={cat.description}
              icon={cat.icon}
              image={cat.image}
              itemCount={counts[cat.slug]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
