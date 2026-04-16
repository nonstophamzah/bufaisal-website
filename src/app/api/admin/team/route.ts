import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAdmin } from '@/lib/verify-admin';

// GET /api/admin/team — fetch managers and shop passwords (labels only, not hashes)
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: mgrs }, { data: pwds }] = await Promise.all([
    supabaseAdmin.from('duty_managers').select('*').order('shop_label').order('name'),
    supabaseAdmin.from('shop_passwords').select('id, shop_label').order('shop_label'),
  ]);

  return NextResponse.json({ managers: mgrs || [], passwords: pwds || [] });
}

// POST /api/admin/team — update shop passwords (hashed)
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, ...body } = await request.json();

  if (action === 'update_password') {
    const { shop_label, new_password } = body;
    if (!shop_label || !new_password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    const hash = await bcrypt.hash(new_password, 10);
    const { error } = await supabaseAdmin
      .from('shop_passwords')
      .update({ password_hash: hash })
      .eq('shop_label', shop_label);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'add_manager') {
    const { name, shop_label } = body;
    const { error } = await supabaseAdmin
      .from('duty_managers')
      .insert({ name, shop_label, is_active: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'toggle_manager') {
    const { id, is_active } = body;
    const { error } = await supabaseAdmin
      .from('duty_managers')
      .update({ is_active })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'delete_manager') {
    const { id } = body;
    const { error } = await supabaseAdmin
      .from('duty_managers')
      .delete()
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
