import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const SHEET_ID = process.env.GOOGLE_SHEETS_ID || '1bUMqgugOM7GomlKgZnAjBsjNLUTt6KmiK0GpU3ct61E';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
  const credentials = JSON.parse(raw);
  return new GoogleAuth({ credentials, scopes: SCOPES });
}

async function sheetsRequest(auth: GoogleAuth, path: string, method: string, body?: unknown) {
  const client = await auth.getClient();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`;
  const res = await client.request({ url, method, data: body });
  return res.data;
}

export async function POST() {
  try {
    const auth = getAuth();
    const supabase = getSupabaseAdmin();

    // Fetch all appliance items
    const { data: items, error } = await supabase
      .from('appliance_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items to export' }, { status: 400 });
    }

    // ── Ensure both sheets exist ──
    const spreadsheet = await sheetsRequest(auth, '', 'GET') as { sheets?: { properties?: { title?: string; sheetId?: number } }[] };
    const existingSheets = (spreadsheet.sheets || []).map((s: { properties?: { title?: string } }) => s.properties?.title);

    const batchRequests: unknown[] = [];
    if (!existingSheets.includes('Raw Data')) {
      batchRequests.push({ addSheet: { properties: { title: 'Raw Data' } } });
    }
    if (!existingSheets.includes('Summary')) {
      batchRequests.push({ addSheet: { properties: { title: 'Summary' } } });
    }
    if (batchRequests.length > 0) {
      await sheetsRequest(auth, ':batchUpdate', 'POST', { requests: batchRequests });
    }

    // ── TAB 1: Raw Data ──
    const rawHeaders = [
      'ID', 'Barcode', 'Product Type', 'Brand', 'Status', 'Condition',
      'Location Status', 'Problems', 'Shop', 'Photo URL', 'Needs Jurf',
      'Date Received', 'Date Sent to Jurf', 'Tested By', 'Repair Notes',
      'Repair Cost', 'Destination Shop', 'Created By', 'Created At',
      'Approval Status',
    ];

    const rawRows = items.map((i) => [
      i.id || '',
      i.barcode || '',
      i.product_type || '',
      i.brand || '',
      i.status || '',
      i.condition || '',
      i.location_status || '',
      Array.isArray(i.problems) ? i.problems.join(', ') : '',
      i.shop || '',
      i.photo_url || '',
      i.needs_jurf ? 'Yes' : 'No',
      i.date_received || '',
      i.date_sent_to_jurf || '',
      i.tested_by || '',
      i.repair_notes || '',
      i.repair_cost != null ? String(i.repair_cost) : '',
      i.destination_shop || '',
      i.created_by || '',
      i.created_at || '',
      i.approval_status || '',
    ]);

    // ── TAB 2: Summary ──
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const countBy = (key: string) => {
      const counts: Record<string, number> = {};
      for (const item of items) {
        const val = (item as Record<string, unknown>)[key];
        const label = (typeof val === 'string' ? val : String(val || 'Unknown')).replace(/_/g, ' ');
        counts[label] = (counts[label] || 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    };

    const byCondition = countBy('condition');
    const byShop = countBy('shop');
    const byTech = countBy('tested_by');

    const totalRepairCost = items.reduce((sum, i) => sum + (Number(i.repair_cost) || 0), 0);
    const itemsWithCost = items.filter((i) => i.repair_cost && Number(i.repair_cost) > 0);
    const avgRepairCost = itemsWithCost.length > 0 ? totalRepairCost / itemsWithCost.length : 0;

    const thisWeekCount = items.filter((i) =>
      i.date_received && new Date(i.date_received) >= thisWeekStart
    ).length;
    const lastWeekCount = items.filter((i) =>
      i.date_received && new Date(i.date_received) >= lastWeekStart && new Date(i.date_received) < thisWeekStart
    ).length;

    const summaryRows: string[][] = [
      ['Bu Faisal Appliance Tracker — Summary', '', `Generated: ${now.toLocaleString('en-GB')}`],
      [],
      ['ITEMS BY CONDITION', '', ''],
      ['Condition', 'Count', ''],
      ...byCondition.map(([k, v]) => [k, String(v), '']),
      [],
      ['ITEMS BY SHOP', '', ''],
      ['Shop', 'Count', ''],
      ...byShop.map(([k, v]) => [k, String(v), '']),
      [],
      ['REPAIR COSTS', '', ''],
      ['Total Repair Cost', `AED ${totalRepairCost.toLocaleString()}`, ''],
      ['Average Repair Cost', `AED ${Math.round(avgRepairCost).toLocaleString()}`, ''],
      ['Items with Repair Cost', String(itemsWithCost.length), ''],
      [],
      ['WEEKLY INTAKE', '', ''],
      ['This Week', String(thisWeekCount), ''],
      ['Last Week', String(lastWeekCount), ''],
      ['Change', `${thisWeekCount - lastWeekCount >= 0 ? '+' : ''}${thisWeekCount - lastWeekCount}`, ''],
      [],
      ['ITEMS BY TECHNICIAN', '', ''],
      ['Technician', 'Count', ''],
      ...byTech.map(([k, v]) => [k, String(v), '']),
    ];

    // ── Clear + Write both tabs ──
    await sheetsRequest(auth, '/values:batchClear', 'POST', {
      ranges: ['Raw Data!A:Z', 'Summary!A:Z'],
    });

    await sheetsRequest(auth, '/values:batchUpdate', 'POST', {
      valueInputOption: 'RAW',
      data: [
        { range: 'Raw Data!A1', values: [rawHeaders, ...rawRows] },
        { range: 'Summary!A1', values: summaryRows },
      ],
    });

    return NextResponse.json({
      success: true,
      itemCount: items.length,
      message: `Exported ${items.length} items to Google Sheets`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    console.error('Sheets export error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
