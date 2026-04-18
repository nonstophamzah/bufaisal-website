'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, Download, AlertTriangle, RefreshCw,
  ExternalLink, User as UserIcon,
} from 'lucide-react';
import {
  driverDetail, toCsv, downloadCsv,
  type DriverDetail, type DashboardWindow,
} from '@/lib/diesel-api';

const SESSION_KEY = 'diesel_mgr_pin_ok';

export default function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const sp = useSearchParams();
  const initialWindow = (sp?.get('window') as DashboardWindow) || 'month';

  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1') setAuthed(true);
    else router.replace('/diesel/dashboard');
  }, [router]);

  const [win, setWin] = useState<DashboardWindow>(initialWindow);
  const [data, setData] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async (w: DashboardWindow = win) => {
    setLoading(true);
    setErr('');
    try {
      const d = await driverDetail(id, w);
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (authed) load(win); }, [authed, win]);

  const exportCsv = () => {
    if (!data) return;
    const rows = data.fills.map((f) => ({
      logged_at: f.logged_at,
      plate: f.truck?.plate_display || '',
      odometer_km: f.odometer_km,
      liters_filled: f.liters_filled,
      km_since_last: f.km_since_last,
      l100: f.liters_per_100km,
      cost_aed: f.cost_aed,
      price_per_liter: f.price_per_liter_at_fill,
      variance_pct: f.variance_percent,
      flagged: f.flagged ? 'Y' : 'N',
      reason: f.flag_reason,
      photo_plate_url: f.photo_plate_url,
      photo_license_url: f.photo_license_url,
      photo_odometer_url: f.photo_odometer_url,
      photo_pump_url: f.photo_pump_url,
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'logged_at',          label: 'When' },
      { key: 'plate',              label: 'Truck' },
      { key: 'odometer_km',        label: 'Odometer' },
      { key: 'liters_filled',      label: 'Liters' },
      { key: 'km_since_last',      label: 'KM Driven' },
      { key: 'l100',               label: 'L/100km' },
      { key: 'cost_aed',           label: 'Cost AED' },
      { key: 'price_per_liter',    label: 'Price/L' },
      { key: 'variance_pct',       label: 'Variance %' },
      { key: 'flagged',            label: 'Flagged' },
      { key: 'reason',             label: 'Reason' },
      { key: 'photo_plate_url',    label: 'Plate Photo' },
      { key: 'photo_license_url',  label: 'Licence Photo' },
      { key: 'photo_odometer_url', label: 'Odometer Photo' },
      { key: 'photo_pump_url',     label: 'Pump Photo' },
    ]);
    const slug = data.driver.full_name.replace(/[^a-z0-9]+/gi, '-');
    downloadCsv(`bufaisal-driver-${slug}-${win}.csv`, csv);
  };

  if (!authed) return null;

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 bg-black/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <Link href="/diesel/dashboard" className="flex items-center gap-1 text-gray-400 text-sm">
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={() => load()} className="p-2 rounded-lg bg-gray-800 text-gray-300 min-h-[36px] min-w-[36px] flex items-center justify-center">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={exportCsv}
              disabled={!data || data.fills.length === 0}
              className="text-xs bg-yellow text-black font-bold rounded-lg px-3 py-2 flex items-center gap-1 min-h-[36px] disabled:opacity-40"
            >
              <Download size={12} /> CSV
            </button>
          </div>
        </div>
        {data && (
          <div>
            <div className="flex items-center gap-2">
              <UserIcon size={18} className="text-yellow" />
              <h1 className="font-heading text-xl text-yellow">{data.driver.full_name}</h1>
              {data.driver.needs_review && (
                <span className="bg-blue-500/20 text-blue-300 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5">New — pending</span>
              )}
              {!data.driver.active && (
                <span className="bg-gray-700 text-gray-300 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5">inactive</span>
              )}
            </div>
            {data.driver.license_number && <p className="text-xs text-gray-500 mt-0.5">Licence #{data.driver.license_number}</p>}
          </div>
        )}
        <div className="flex gap-1.5 mt-3 overflow-x-auto">
          {(['today','week','month','quarter','all'] as DashboardWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-heading tracking-wider ${
                win === w ? 'bg-yellow text-black' : 'bg-gray-900 border border-gray-800 text-gray-400'
              }`}
            >
              {w === 'today' ? 'DAY' : w === 'week' ? 'WEEK' : w === 'month' ? 'MONTH' : w === 'quarter' ? 'QUARTER' : 'ALL TIME'}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 pt-4 pb-20">
        {err && <div className="bg-red-500/10 border border-red-500/40 text-red-200 rounded-xl p-3 mb-4 text-sm">{err}</div>}
        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading…
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <Stat label="Fills" value={data.stats.total_fills} />
              <Stat label="Liters" value={data.stats.total_liters} />
              <Stat label="Cost AED" value={data.stats.total_cost_aed} />
              <Stat label="Avg L/100km" value={data.stats.avg_l100 ?? '—'} />
            </div>
            {data.stats.flag_count > 0 && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-sm text-red-200">
                <AlertTriangle size={16} /> {data.stats.flag_count} flagged fill{data.stats.flag_count === 1 ? '' : 's'} in this window
              </div>
            )}

            {data.truck_mix.length > 0 && (
              <>
                <h3 className="font-heading text-sm text-gray-400 tracking-wider mb-2">TRUCKS DRIVEN</h3>
                <div className="bg-gray-950 border border-gray-800 rounded-xl divide-y divide-gray-800 mb-5">
                  {data.truck_mix.map((t) => (
                    <Link
                      key={t.truck_id}
                      href={`/diesel/dashboard/truck/${t.truck_id}?window=${win}`}
                      className="flex justify-between items-center px-3 py-2 text-sm hover:bg-gray-900/60"
                    >
                      <span>{t.plate}</span>
                      <span className="text-gray-400 text-xs">
                        {t.fills} fills · <span className="text-white font-semibold">{t.avg_l100 ?? '—'}</span> L/100km
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}

            <h3 className="font-heading text-sm text-gray-400 tracking-wider mb-2">FILL HISTORY</h3>
            {data.fills.length === 0 && <div className="text-sm text-gray-500 text-center py-8">No fills in this window.</div>}
            <div className="space-y-2">
              {data.fills.map((f) => <FillCard key={f.id} f={f} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-heading text-2xl">{value}</p>
    </div>
  );
}

type FillLike = {
  id: string;
  logged_at: string;
  odometer_km: number | null;
  liters_filled: number | null;
  km_since_last: number | null;
  liters_per_100km: number | null;
  cost_aed: number | null;
  variance_percent: number | null;
  flagged: boolean;
  flag_reason: string | null;
  photo_plate_url: string | null;
  photo_license_url: string | null;
  photo_odometer_url: string | null;
  photo_pump_url: string | null;
  truck?: { id: string; plate_display: string } | null;
};

function FillCard({ f }: { f: FillLike }) {
  const when = relative(f.logged_at);
  const [showPhotos, setShowPhotos] = useState(false);
  return (
    <div className={`rounded-xl border ${f.flagged ? 'bg-red-500/5 border-red-500/40' : 'bg-gray-950 border-gray-800'}`}>
      <div className="p-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-heading text-sm">{f.truck?.plate_display || 'unknown truck'}</p>
            <p className="text-[11px] text-gray-500">{when}</p>
          </div>
          <div className="text-right">
            <p className="text-sm">
              <span className="font-bold">{f.liters_filled ?? '—'}</span>
              <span className="text-gray-500 text-xs">L</span>
              {' · '}
              <span className="font-bold">{f.liters_per_100km ?? '—'}</span>
              <span className="text-gray-500 text-xs">L/100km</span>
            </p>
            <p className="text-[11px] text-gray-500">
              {f.km_since_last !== null ? `${f.km_since_last}km` : 'first fill'}
              {typeof f.cost_aed === 'number' && ` · ${f.cost_aed} AED`}
            </p>
          </div>
        </div>
        {f.flagged && f.flag_reason && (
          <div className="mt-2 text-xs text-red-300 flex items-start gap-1">
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> {f.flag_reason}
          </div>
        )}
        <button onClick={() => setShowPhotos((v) => !v)} className="mt-2 text-[11px] text-gray-400 underline underline-offset-2">
          {showPhotos ? 'hide photos' : 'show photos'}
        </button>
        {showPhotos && (
          <div className="mt-2 grid grid-cols-4 gap-1">
            {[
              { url: f.photo_plate_url,    label: 'Plate' },
              { url: f.photo_license_url,  label: 'Licence' },
              { url: f.photo_odometer_url, label: 'Odo' },
              { url: f.photo_pump_url,     label: 'Pump' },
            ].map((p) => p.url ? (
              <a key={p.label} href={p.url} target="_blank" rel="noreferrer" className="relative aspect-square rounded-md overflow-hidden bg-gray-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/70 text-center py-0.5">{p.label}</span>
                <ExternalLink size={10} className="absolute top-1 right-1 text-white/70" />
              </a>
            ) : (
              <div key={p.label} className="aspect-square rounded-md bg-gray-900 flex items-center justify-center text-[9px] text-gray-600">no {p.label}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function relative(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)      return `${Math.round(s)}s ago`;
  if (s < 3600)    return `${Math.round(s / 60)}m ago`;
  if (s < 86_400)  return `${Math.round(s / 3600)}h ago`;
  if (s < 604_800) return `${Math.round(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}
