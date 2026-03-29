import Hero from '@/components/Hero';
import CategoryCard from '@/components/CategoryCard';
import ItemCard from '@/components/ItemCard';
import SocialProof from '@/components/SocialProof';
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

      {/* Social Proof */}
      <SocialProof />

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
              image={cat.image}
            />
          ))}
        </div>
      </section>

      {/* What We Sell */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-black text-white rounded-2xl p-8 md:p-12">
          <h2 className="font-heading text-3xl md:text-4xl mb-4">
            WHAT WE <span className="text-yellow">SELL</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-yellow/20 text-yellow font-heading text-xl px-3 py-1 rounded">
                  80%
                </span>
                <h3 className="font-heading text-xl">QUALITY USED ITEMS</h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Carefully inspected pre-owned furniture, appliances, and home
                goods. Every item is checked for quality before it hits our
                shelves. Save up to 70% compared to buying new.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-yellow/20 text-yellow font-heading text-xl px-3 py-1 rounded">
                  20%
                </span>
                <h3 className="font-heading text-xl">BRAND NEW ITEMS</h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                We also manufacture brand new sofas, beds, cupboards &amp;
                bedroom sets. Custom-made to order at factory-direct prices.
                Ask us on WhatsApp for our new collection.
              </p>
            </div>
          </div>
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
