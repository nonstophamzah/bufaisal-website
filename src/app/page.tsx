import Hero from '@/components/Hero';
import CategoryCard from '@/components/CategoryCard';
import ItemCard from '@/components/ItemCard';
import { CATEGORIES } from '@/lib/constants';
import { supabase } from '@/lib/supabase';

export const revalidate = 60;

async function getLatestItems() {
  const { data } = await supabase
    .from('shop_items')
    .select('*')
    .eq('is_published', true)
    .eq('is_sold', false)
    .eq('is_hidden', false)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(8);
  return data || [];
}

async function getHeroConfig() {
  const { data } = await supabase
    .from('website_config')
    .select('config_key, config_value')
    .in('config_key', ['hero_title', 'hero_subtitle']);

  const config: Record<string, string> = {};
  (data || []).forEach((row) => {
    config[row.config_key] = row.config_value;
  });
  return config;
}

export default async function HomePage() {
  const [items, heroConfig] = await Promise.all([
    getLatestItems(),
    getHeroConfig(),
  ]);

  return (
    <>
      <Hero
        title={heroConfig.hero_title}
        subtitle={heroConfig.hero_subtitle}
      />

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="font-heading text-4xl md:text-5xl mb-2">
          BROWSE BY <span className="text-yellow">CATEGORY</span>
        </h2>
        <p className="text-muted mb-8">
          Find exactly what you need across our collections
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.slug}
              name={cat.name}
              slug={cat.slug}
              description={cat.description}
              icon={cat.icon}
            />
          ))}
        </div>
      </section>

      {/* Latest Arrivals */}
      {items.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 bg-light rounded-3xl mb-16">
          <h2 className="font-heading text-4xl md:text-5xl mb-2">
            LATEST <span className="text-yellow">ARRIVALS</span>
          </h2>
          <p className="text-muted mb-8">Fresh items just added to our collection</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
