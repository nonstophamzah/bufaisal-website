import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShopItem } from '@/lib/supabase';
import { resolveItemImageUrl } from '@/lib/item-image';
import { resolvePublicItemFields } from '@/lib/resolve-public-item-fields';
import { augmentProductSchema } from '@/lib/augment-product-schema';
import { fetchSimilarItems } from '@/lib/similar-items';
import ItemDetailClient from './item-detail-client';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// React.cache deduplicates across generateMetadata + page component.
// Phase 6.0: filter on is_published + is_hidden to stop UUID leaks of
// processing/pending/archived rows. is_sold is intentionally NOT filtered
// — sold items stay on the site (with the SOLD overlay) for SEO.
const getItem = cache(async (id: string): Promise<ShopItem | null> => {
  const { data } = await getSupabase()
    .from('shop_items')
    .select('*')
    .eq('id', id)
    .eq('is_published', true)
    .eq('is_hidden', false)
    .maybeSingle();
  return data;
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) return { title: 'Item Not Found' };

  const f = resolvePublicItemFields(item);
  const title = f.seoTitle || `${f.itemName} — Bu Faisal`;
  const description =
    f.seoDescription ||
    f.description ||
    `${f.itemName} available at Bu Faisal second-hand store in Ajman, UAE.`;
  const image = resolveItemImageUrl(item);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image && { images: [{ url: image, width: 1200, height: 630, alt: f.itemName ?? 'Product image' }] }),
      type: 'website',
      url: `https://bufaisal.ae/item/${id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image && { images: [image] }),
    },
    alternates: {
      canonical: `/item/${id}`,
    },
  };
}

// Rewriting `</script>` neutralizes the most common script-tag breakout;
// the broader `<` escape is belt-and-braces.
function escapeJsonLd(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/</g, '\\u003c');
}

export default async function ItemDetailPage({ params }: Props) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  // Increment views server-side (fire-and-forget)
  getSupabase().rpc('increment_views', { item_id: id }).then(() => {});

  // Similar items run server-side so the cards land in initial HTML
  // (SEO + LCP friendly). Returns [] when below the 4-row visibility
  // threshold — the client component then suppresses the section.
  const similarItems = await fetchSimilarItems(item);

  const f = resolvePublicItemFields(item);
  const canonicalUrl = `https://bufaisal.ae/item/${id}`;

  // Product JSON-LD: source = stored `published_product_schema`, augmented
  // at render time with page-level fields the AI doesn't know (sku, url,
  // category, seller, negotiable hint). If the column is null (legacy /
  // pre-Phase-5 rows), the helper returns null and we skip the script tag.
  // Negotiable resolves via `admin_negotiable ?? worker_negotiable` per
  // the Phase 6A spec — the legacy `negotiable` mirror retires in Phase 6.5.
  const productSchema = augmentProductSchema(f.productSchema, {
    sku: item.ai_barcode_extracted,
    url: canonicalUrl,
    category: f.category,
    negotiable: item.admin_negotiable ?? item.worker_negotiable,
  });

  // BreadcrumbList JSON-LD (unchanged shape from PR #12; Phase 6.4 only
  // fixes the position-4 leaf to flow through the resolver per
  // CLAUDE.md's public-display rule).
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://bufaisal.ae' },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: 'https://bufaisal.ae/shop' },
      ...(f.category ? [{
        '@type': 'ListItem', position: 3,
        name: f.category,
        item: `https://bufaisal.ae/shop?category=${encodeURIComponent(f.category)}`,
      }] : []),
      { '@type': 'ListItem', position: f.category ? 4 : 3, name: f.itemName ?? item.item_name },
    ],
  };

  return (
    <>
      {productSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: escapeJsonLd(productSchema) }}
        />
      )}
      {f.faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: escapeJsonLd(f.faqSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(breadcrumbSchema) }}
      />
      <ItemDetailClient item={item} similarItems={similarItems} />
    </>
  );
}
