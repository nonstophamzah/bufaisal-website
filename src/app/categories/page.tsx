import CategoryCard from '@/components/CategoryCard';
import { CATEGORIES } from '@/lib/constants';
import { supabase } from '@/lib/supabase';

export const revalidate = 60;

async function getCategoryCounts() {
  const counts: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    const { count } = await supabase
      .from('shop_items')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true)
      .eq('is_sold', false)
      .eq('category', cat.name);
    counts[cat.slug] = count || 0;
  }
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
