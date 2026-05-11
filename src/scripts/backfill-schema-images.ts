/**
 * One-shot backfill: rewrite published_product_schema.image[] on every
 * already-published shop_items row, replacing the AI-emitted placeholder
 * tokens (e.g. "photo_1_url") with the real Cloudinary URLs from
 * worker_photo_*.
 *
 * Phase 6.4 prerequisite. Phase 5's approval helper now substitutes at
 * publish time (src/lib/admin-pending-publish.ts → substituteSchemaImages).
 * This script handles the 5 rows that were already published before that
 * helper started substituting.
 *
 * Run with:
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx src/scripts/backfill-schema-images.ts          # dry-run
 *
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx src/scripts/backfill-schema-images.ts --write  # commit
 *
 * Calls substituteSchemaImages directly — does NOT call buildPublishUpdate
 * (which would rewrite every published_* column and risk drift).
 */

import { createClient } from '@supabase/supabase-js';
import { substituteSchemaImages } from '@/lib/resolve-schema-images';

interface BackfillRow {
  id: string;
  item_name: string | null;
  published_item_name: string | null;
  published_product_schema: Record<string, unknown> | null;
  worker_photo_brand_url: string | null;
  worker_photo_2_url: string | null;
  worker_photo_3_url: string | null;
  worker_photo_barcode_url: string | null;
}

function arraysEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const write = process.argv.includes('--write');

  for (const [name, value] of [
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', supabaseKey],
  ] as const) {
    if (!value) {
      console.error(`Missing env var: ${name}`);
      process.exit(1);
    }
  }

  const supabase = createClient(supabaseUrl!, supabaseKey!);
  const mode = write ? 'WRITE' : 'DRY-RUN';
  console.log(`Mode: ${mode}\n`);

  const { data, error } = await supabase
    .from('shop_items')
    .select(
      'id, item_name, published_item_name, published_product_schema, ' +
        'worker_photo_brand_url, worker_photo_2_url, worker_photo_3_url, ' +
        'worker_photo_barcode_url'
    )
    .eq('status', 'published')
    .order('admin_approved_at', { ascending: true });

  if (error) {
    console.error('Failed to load published rows:', error);
    process.exit(1);
  }

  // supabase-js's inference gives up on long select strings — cast through unknown.
  const rows = (data ?? []) as unknown as BackfillRow[];
  console.log(`Scanned ${rows.length} published row(s).\n`);

  let changed = 0;
  let unchanged = 0;
  let failed = 0;

  for (const row of rows) {
    const oldImage = (row.published_product_schema as { image?: unknown } | null)?.image ?? null;
    const newSchema = substituteSchemaImages(row.published_product_schema, row);
    const newImage = (newSchema as { image?: unknown } | null)?.image ?? null;

    const label = row.published_item_name ?? row.item_name ?? '(unnamed)';
    if (arraysEqual(oldImage, newImage)) {
      console.log(`= ${row.id}  ${label}`);
      console.log(`    image[] unchanged: ${JSON.stringify(oldImage)}`);
      unchanged++;
      continue;
    }

    console.log(`~ ${row.id}  ${label}`);
    console.log(`    old image[]: ${JSON.stringify(oldImage)}`);
    console.log(`    new image[]: ${JSON.stringify(newImage)}`);

    if (!write) {
      changed++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('shop_items')
      .update({ published_product_schema: newSchema })
      .eq('id', row.id);

    if (updateErr) {
      console.log(`    UPDATE FAILED: ${updateErr.message}`);
      failed++;
      continue;
    }

    const { error: auditErr } = await supabase.from('audit_log').insert({
      item_id: row.id,
      action: 'backfill_schema_images',
      actor_type: 'system',
      actor_id: 'phase-6.4-prereq',
      before_state: { image: oldImage },
      after_state: { image: newImage },
    });
    if (auditErr) {
      console.log(`    audit insert failed (update succeeded): ${auditErr.message}`);
    }
    changed++;
  }

  console.log('');
  if (write) {
    console.log(`Done. Scanned ${rows.length}, changed ${changed}, unchanged ${unchanged}, failed ${failed}.`);
    process.exit(failed > 0 ? 1 : 0);
  } else {
    console.log(`Done (dry-run). Scanned ${rows.length}, would change ${changed}, unchanged ${unchanged}.`);
    console.log('Re-run with --write to commit.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
