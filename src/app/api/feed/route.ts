import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  const { data: items, error } = await supabase
    .from('shop_items')
    .select('id, item_name, brand, category, sale_price, thumbnail_url, image_urls, condition, description, barcode, product_type, is_sold')
    .eq('is_published', true)
    .eq('is_sold', false)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (format === 'google') {
    return buildGoogleFeed(items || []);
  }

  return buildFacebookFeed(items || []);
}

interface FeedItem {
  id: string;
  item_name: string;
  brand: string | null;
  category: string | null;
  sale_price: number | null;
  thumbnail_url: string | null;
  image_urls: string[] | null;
  condition: string | null;
  description: string | null;
  barcode: string | null;
  product_type: string | null;
  is_sold: boolean;
}

function mapCondition(condition: string | null): string {
  if (!condition) return 'used';
  if (condition === 'Brand New') return 'new';
  return 'used';
}

function buildFacebookFeed(items: FeedItem[]) {
  // Facebook Product Catalog JSON format
  const products = items.map(item => ({
    id: item.id,
    title: item.item_name,
    description: item.description || item.item_name,
    availability: 'in stock',
    condition: mapCondition(item.condition),
    price: `${item.sale_price || 0} AED`,
    link: `https://bufaisal.ae/item/${item.id}`,
    image_link: item.thumbnail_url || item.image_urls?.[0] || '',
    brand: item.brand || 'Bu Faisal',
    ...(item.barcode && { gtin: item.barcode }),
    product_type: item.category || 'General',
    custom_label_0: item.condition || 'Used',
  }));

  return NextResponse.json(products, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}

function buildGoogleFeed(items: FeedItem[]) {
  // Google Merchant Center RSS/XML format
  const xmlItems = items.map(item => `
    <item>
      <g:id>${escapeXml(item.id)}</g:id>
      <title>${escapeXml(item.item_name)}</title>
      <description>${escapeXml(item.description || item.item_name)}</description>
      <link>https://bufaisal.ae/item/${item.id}</link>
      <g:image_link>${escapeXml(item.thumbnail_url || item.image_urls?.[0] || '')}</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${item.sale_price || 0} AED</g:price>
      <g:condition>${mapCondition(item.condition)}</g:condition>
      <g:brand>${escapeXml(item.brand || 'Bu Faisal')}</g:brand>
      ${item.barcode ? `<g:gtin>${escapeXml(item.barcode)}</g:gtin>` : '<g:identifier_exists>false</g:identifier_exists>'}
      <g:product_type>${escapeXml(item.category || 'General')}</g:product_type>
    </item>`).join('');

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
