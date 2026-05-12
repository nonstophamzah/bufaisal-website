import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ShopItem } from '@/lib/supabase';
import { resolvePublicItemFields } from '@/lib/resolve-public-item-fields';

// Product feed for Facebook Catalog / Google Merchant Center
// GET /api/feed?format=facebook|google (default: facebook)

export const revalidate = 3600; // Cache for 1 hour

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'facebook';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const supabase = createClient(url, key);

  // Select both legacy text columns (resolver fallback for pre-Phase-5
  // rows) and the canonical published_* / Phase 1B columns the feed
  // emits going forward.
  const { data: items, error } = await supabase
    .from('shop_items')
    .select(
      'id, item_name, brand, category, description, sale_price, thumbnail_url, image_urls, ' +
      'published_item_name, published_brand, published_category, published_product_type, published_description, ' +
      'worker_condition_type, admin_condition_grade, worker_condition_grade, ai_barcode_extracted, is_sold'
    )
    .eq('is_published', true)
    .eq('is_sold', false)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (items ?? []) as unknown as ShopItem[];

  if (format === 'google') {
    return buildGoogleFeed(rows);
  }

  return buildFacebookFeed(rows);
}

// FB Catalog / Google Merchant `condition` is a new-vs-used enum,
// driven by `worker_condition_type`. `grade` (Excellent/Good/Fair) is
// passed in as a documented canonical input but doesn't affect the
// mapping today — a separate `custom_label_0` carries the grade.
function mapCondition(
  type: 'Used' | 'New' | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  grade: 'Excellent' | 'Good' | 'Fair' | null
): string {
  return type === 'New' ? 'new' : 'used';
}

function buildFacebookFeed(items: ShopItem[]) {
  // Facebook Product Catalog JSON format
  const products = items.map(item => {
    const f = resolvePublicItemFields(item);
    const conditionGrade =
      item.admin_condition_grade ?? item.worker_condition_grade;
    return {
      id: item.id,
      title: f.itemName ?? '',
      description: f.description || f.itemName || '',
      availability: 'in stock',
      condition: mapCondition(item.worker_condition_type, conditionGrade),
      price: `${item.sale_price || 0} AED`,
      link: `https://bufaisal.ae/item/${item.id}`,
      image_link: item.thumbnail_url || item.image_urls?.[0] || '',
      brand: f.brand || 'Bu Faisal',
      ...(item.ai_barcode_extracted && { gtin: item.ai_barcode_extracted }),
      product_type: f.category || 'General',
      custom_label_0: conditionGrade || 'Used',
    };
  });

  return NextResponse.json(products, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}

function buildGoogleFeed(items: ShopItem[]) {
  // Google Merchant Center RSS/XML format
  const xmlItems = items.map(item => {
    const f = resolvePublicItemFields(item);
    const conditionGrade =
      item.admin_condition_grade ?? item.worker_condition_grade;
    return `
    <item>
      <g:id>${escapeXml(item.id)}</g:id>
      <title>${escapeXml(f.itemName ?? '')}</title>
      <description>${escapeXml(f.description || f.itemName || '')}</description>
      <link>https://bufaisal.ae/item/${item.id}</link>
      <g:image_link>${escapeXml(item.thumbnail_url || item.image_urls?.[0] || '')}</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${item.sale_price || 0} AED</g:price>
      <g:condition>${mapCondition(item.worker_condition_type, conditionGrade)}</g:condition>
      <g:brand>${escapeXml(f.brand || 'Bu Faisal')}</g:brand>
      ${item.ai_barcode_extracted ? `<g:gtin>${escapeXml(item.ai_barcode_extracted)}</g:gtin>` : '<g:identifier_exists>false</g:identifier_exists>'}
      <g:product_type>${escapeXml(f.category || 'General')}</g:product_type>
    </item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Bu Faisal Product Feed</title>
    <link>https://bufaisal.ae</link>
    <description>Quality second-hand goods from Bu Faisal</description>
    ${xmlItems}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
