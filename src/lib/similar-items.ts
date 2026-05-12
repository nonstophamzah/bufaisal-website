// Phase 6.4 PR B — tiered similar-items query for /item/[id].
//
// Three tiers (each filtered to status='published', not hidden, not sold,
// excluding the current item):
//   1. same brand + same category
//   2. same category + same worker_shop_id
//   3. same category overall
//
// Within each tier rows are ordered by published_at DESC (freshest first).
// Tiers are merged in order and deduped by id; we stop at 8 rows.
//
// Filters use `published_*` columns to stay forward-compatible with the
// Phase 6.5 legacy-mirror retirement.
//
// Returns [] when the merged set is below the visibility threshold so the
// page suppresses the "Similar items" section entirely (audit confirmed
// the site has only 3 publicly visible rows today; <4 matches is typical).

import { createClient } from '@supabase/supabase-js';
import type { ShopItem } from './supabase';

const TARGET = 8;
const MIN_THRESHOLD = 4;

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function fetchSimilarItems(
  currentItem: ShopItem,
): Promise<ShopItem[]> {
  const category = currentItem.published_category ?? currentItem.category;
  if (!category) return [];

  const brand = currentItem.published_brand ?? currentItem.brand;
  const shopId = currentItem.worker_shop_id;

  const supabase = getClient();
  const baseQuery = () =>
    supabase
      .from('shop_items')
      .select('*')
      .eq('status', 'published')
      .eq('is_hidden', false)
      .eq('is_sold', false)
      .neq('id', currentItem.id);

  const collected = new Map<string, ShopItem>();

  // Tier 1 — same brand + same category
  if (brand) {
    const { data } = await baseQuery()
      .eq('published_category', category)
      .eq('published_brand', brand)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(TARGET);
    for (const row of (data ?? []) as ShopItem[]) {
      if (!collected.has(row.id)) collected.set(row.id, row);
    }
  }

  // Tier 2 — same category + same shop
  if (collected.size < TARGET && shopId) {
    const { data } = await baseQuery()
      .eq('published_category', category)
      .eq('worker_shop_id', shopId)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(TARGET);
    for (const row of (data ?? []) as ShopItem[]) {
      if (collected.size >= TARGET) break;
      if (!collected.has(row.id)) collected.set(row.id, row);
    }
  }

  // Tier 3 — same category overall
  if (collected.size < TARGET) {
    const { data } = await baseQuery()
      .eq('published_category', category)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(TARGET);
    for (const row of (data ?? []) as ShopItem[]) {
      if (collected.size >= TARGET) break;
      if (!collected.has(row.id)) collected.set(row.id, row);
    }
  }

  if (collected.size < MIN_THRESHOLD) return [];
  return Array.from(collected.values()).slice(0, TARGET);
}
