'use client';

// ============================================================
// /diesel/dashboard — Manager view
// ============================================================
// Tabs: Today / Trucks / Drivers / Flagged / Trends / Log
// Needs-Review inbox appears when there are auto-created rows to confirm.
// Mobile-first, same yellow/black style as appliance manager.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Fuel, ArrowLeft, AlertTriangle, Check, Clock, Truck as TruckIcon,
  User, Flag, TrendingUp, List, Search, X, Edit2, GitMerge, RefreshCw, ExternalLink,
} from 'lucide-react';
import {
  checkManagerPin, dashboardSnapshot, fullLog, trendsData, report,
  editTruck, editDriver, mergeTrucks, mergeDrivers,
  type DashboardSnapshot, type FullLogRow, type TrendPoint, type ReportResult,
  type TruckStatsRow, type DriverStatsRow, type NeedsReviewTruck, type NeedsReviewDriver,
} from '@/lib/diesel-api';

const SESSION_KEY = 'diesel_mgr_pin_ok';

type TabKey = 'today' | 'trucks' | 'drivers' | 'flagged' | 'trends' | 'log';

// ============================================================
// ENTRY COMPONENT (handles gate + main)
// ============================================================
export default function DashboardPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fallbackPin, setFallbackPin] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1') {
      setAuthed(true);
    }
    setChecking(false);
  }, []);

  const handlePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setSubmitting(true);
    setPinErr('');
    try {
      const res = await checkManagerPin(pin);
      if (!res.ok) {
        setPinErr('Wrong PIN');
        setPin('');
        return;
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      setFallbackPin(Boolean(res.using_fallback_pin));
      setAuthed(true);
    } catch {
      setPinErr('Server error');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) return null;

  if (!authed) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full bg-yellow flex items-center justify-center mb-4">
          <Fuel size={32} className="text-black" />
        </div>
        <h1 className="font-heading text-4xl mb-2">DIESEL DASHBOARD</h1>
        <p className="text-gray-400 text-sm mb-8">Manager PIN</p>
        <form onSubmit={handlePin} className="w-full max-w-xs">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            maxLength={10}
            placeholder="PIN"
            className="w-full text-center text-3xl tracking-[0.5em] font-heading py-5 rounded-2xl bg-gray-900 text-yellow placeholder-gray-700 border-2 border-gray-800 focus:border-yellow focus:outline-none"
          />
          {pinErr && <p className="text-red-400 text-center text-sm mt-3">{pinErr}</p>}
          <button
            type="submit"
            disabled={submitting || pin.length < 4}
            className="w-full mt-4 py-5 rounded-2xl bg-yellow text-black font-heading text-2xl active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={24} className="animate-spin" /> : 'ENTER'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/diesel')}
            className="w-full mt-3 py-3 text-gray-500 text-sm flex items-center justify-center gap-1"
          >
            <ArrowLeft size={14} /> Back to diesel log
          </button>
        </form>
      </div>
    );
  }

  return <Dashboard fallbackPin={fallbackPin} />;
}

// ============================================================
// MAIN DASHBOARD
// ============================================================
function Dashboard({ fallbackPin }: { fallbackPin: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('today');
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');
  const [toast, setToast] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const s = await dashboardSnapshot();
      setSnapshot(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const needsReviewCount =
    (snapshot?.needs_review.trucks.length || 0) +
    (snapshot?.needs_review.drivers.length || 0);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fuel size={20} className="text-yellow" />
          <h1 className="font-heading text-xl">DIESEL DASHBOARD</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-gray-400 hover:text-white" title="Refresh">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { sessionStorage.removeItem(SESSION_KEY); router.push('/diesel'); }}
            className="text-xs text-gray-500 border border-gray-700 rounded-lg px-2 py-1"
          >
            Exit
          </button>
        </div>
      </header>

      {/* FALLBACK PIN WARNING */}
      {fallbackPin && (
        <div className="bg-yellow/10 border-b border-yellow/40 text-yellow text-xs px-4 py-2">
          Using submitter PIN for dashboard (no separate manager PIN set). Set{' '}
          <code className="bg-black/40 px-1 rounded">diesel_config.manager_pin_hash</code> to split them.
        </div>
      )}

      {/* TABS */}
      <nav className="flex overflow-x-auto bg-gray-950 border-b border-gray-800 px-2">
        {(
          [
            { k: 'today',   l: 'Today',   i: <Clock size={14} /> },
            { k: 'trucks',  l: 'Trucks',  i: <TruckIcon size={14} /> },
            { k: 'drivers', l: 'Drivers', i: <User size={14} /> },
            { k: 'flagged', l: 'Flagged', i: <Flag size={14} /> },
            { k: 'trends',  l: 'Trends',  i: <TrendingUp size={14} /> },
            { k: 'log',     l: 'Log',     i: <List size={14} /> },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex items-center gap-1 whitespace-nowrap px-3 py-3 text-sm border-b-2 ${
              tab === t.k ? 'border-yellow text-yellow' : 'border-transparent text-gray-400'
            }`}
          >
            {t.i} {t.l}
            {t.k === 'flagged' && snapshot && snapshot.flagged.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5">{snapshot.flagged.length}</span>
            )}
          </button>
        ))}
      </nav>

      {/* NEEDS-REVIEW INBOX (always visible when non-empty) */}
      {snapshot && needsReviewCount > 0 && (
        <NeedsReviewInbox
          trucks={snapshot.needs_review.trucks}
          drivers={snapshot.needs_review.drivers}
          allTrucks={snapshot.trucks}
          allDrivers={snapshot.drivers}
          onAction={async (msg) => { flash(msg); await load(); }}
        />
      )}

      {/* BODY */}
      <main className="px-4 pt-4 pb-20">
        {err && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-200 rounded-xl p-3 mb-4 text-sm">
            {err}
          </div>
        )}

        {loading && !snapshot && (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading…
          </div>
        )}

        {snapshot && (
          <>
            {tab === 'today'   && <TodayTab   snap={snapshot} />}
            {tab === 'trucks'  && <TrucksTab  snap={snapshot} onChanged={load} flash={flash} />}
            {tab === 'drivers' && <DriversTab snap={snapshot} onChanged={load} flash={flash} />}
            {tab === 'flagged' && <FlaggedTab snap={snapshot} />}
            {tab === 'trends'  && <TrendsTab />}
            {tab === 'log'     && <LogTab />}
          </>
        )}
      </main>

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm rounded-xl px-4 py-2 shadow-lg z-20">
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB: TODAY
// ============================================================
function TodayTab({ snap }: { snap: DashboardSnapshot }) {
  const fills = snap.today;
  const totalLiters = fills.reduce((a, r) => a + (r.liters_filled || 0), 0);
  const totalCost   = fills.reduce((a, r) => a + (r.cost_aed || 0), 0);
  const flaggedToday = fills.filter((r) => r.flagged).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Fills today"    value={fills.length} />
        <StatCard label="Liters today"   value={totalLiters.toFixed(1)} />
        <StatCard label="Cost today"     value={`${totalCost.toFixed(0)} AED`} />
        <StatCard label="Flags today"    value={flaggedToday} tone={flaggedToday > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="text-xs text-gray-500 mb-1">
        Fleet 30-day avg: <span className="text-white font-semibold">{snap.fleet_avg_l100 ?? '—'} L/100km</span>
      </div>

      <h3 className="font-heading text-lg mt-4 mb-2">Last 24h</h3>
      {fills.length === 0 && <EmptyState text="No fills in the last 24 hours." />}
      {fills.map((f) => <FillCard key={f.id} f={f} />)}
    </>
  );
}

// ============================================================
// TAB: TRUCKS
// ============================================================
function TrucksTab({
  snap, onChanged, flash,
}: {
  snap: DashboardSnapshot; onChanged: () => Promise<void> | void; flash: (m: string) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return snap.trucks;
    return snap.trucks.filter((t) =>
      (t.plate_display || '').toLowerCase().includes(n) ||
      (t.nickname || '').toLowerCase().includes(n)
    );
  }, [q, snap.trucks]);

  const [editing, setEditing] = useState<TruckStatsRow | null>(null);
  const [merging, setMerging] = useState<TruckStatsRow | null>(null);

  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search plate or nickname…" />
      {filtered.length === 0 && <EmptyState text="No trucks match." />}
      <div className="space-y-2">
        {filtered.map((t) => (
          <div
            key={t.truck_id}
            className="bg-gray-950 border border-gray-800 rounded-xl p-3"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading text-lg">{t.plate_display}</span>
                  {t.needs_review && (
                    <span className="bg-blue-500/20 text-blue-300 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5">
                      New — pending review
                    </span>
                  )}
                  {!t.active && (
                    <span className="bg-gray-700 text-gray-300 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5">inactive</span>
                  )}
                </div>
                {t.nickname && <p className="text-xs text-gray-500">{t.nickname}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {t.total_fills} fills
                  {t.last_fill_at && ` · last ${relative(t.last_fill_at)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{t.avg_l100_last10 ?? '—'}<span className="text-xs text-gray-500 ml-1">L/100km</span></p>
                {t.flag_count > 0 && <p className="text-xs text-red-400">{t.flag_count} flagged</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setEditing(t)} className="text-xs bg-gray-800 text-white rounded-lg px-2 py-1 flex items-center gap-1">
                <Edit2 size={12} /> Edit
              </button>
              <button onClick={() => setMerging(t)} className="text-xs bg-gray-800 text-white rounded-lg px-2 py-1 flex items-center gap-1">
                <GitMerge size={12} /> Merge into…
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditTruckModal
          truck={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); flash('Truck updated'); await onChanged(); }}
        />
      )}
      {merging && (
        <MergeModal
          kind="truck"
          from={{ id: merging.truck_id, label: merging.plate_display }}
          candidates={snap.trucks.filter((x) => x.truck_id !== merging.truck_id && x.active).map((x) => ({ id: x.truck_id, label: `${x.plate_display} (${x.total_fills} fills)` }))}
          onClose={() => setMerging(null)}
          onMerged={async (n) => { setMerging(null); flash(`Merged ${n} fills`); await onChanged(); }}
        />
      )}
    </>
  );
}

// ============================================================
// TAB: DRIVERS
// ============================================================
function DriversTab({
  snap, onChanged, flash,
}: {
  snap: DashboardSnapshot; onChanged: () => Promise<void> | void; flash: (m: string) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return snap.drivers;
    return snap.drivers.filter((d) => (d.full_name || '').toLowerCase().includes(n) || (d.nickname || '').toLowerCase().includes(n));
  }, [q, snap.drivers]);

  const [editing, setEditing] = useState<DriverStatsRow | null>(null);
  const [merging, setMerging] = useState<DriverStatsRow | null>(null);

  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search driver name…" />
      {filtered.length === 0 && <EmptyState text="No drivers match." />}
      <div className="space-y-2">
        {filtered.map((d) => (
          <div key={d.driver_id} className="bg-gray-950 border border-gray-800 rounded-xl p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading text-lg">{d.full_name}</span>
                  {d.needs_review && (
                    <span className="bg-blue-500/20 text-blue-300 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5">
                      New — pending review
                    </span>
                  )}
                  {!d.active && <span className="bg-gray-700 text-gray-300 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5">inactive</span>}
                </div>
                {d.nickname && <p className="text-xs text-gray-500">{d.nickname}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {d.total_fills} fills
                  {d.last_fill_at && ` · last ${relative(d.last_fill_at)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{d.avg_l100_last10 ?? '—'}<span className="text-xs text-gray-500 ml-1">L/100km</span></p>
                {d.flag_count > 0 && <p className="text-xs text-red-400">{d.flag_count} flagged</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setEditing(d)} className="text-xs bg-gray-800 text-white rounded-lg px-2 py-1 flex items-center gap-1">
                <Edit2 size={12} /> Edit
              </button>
              <button onClick={() => setMerging(d)} className="text-xs bg-gray-800 text-white rounded-lg px-2 py-1 flex items-center gap-1">
                <GitMerge size={12} /> Merge into…
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditDriverModal
          driver={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); flash('Driver updated'); await onChanged(); }}
        />
      )}
      {merging && (
        <MergeModal
          kind="driver"
          from={{ id: merging.driver_id, label: merging.full_name }}
          candidates={snap.drivers.filter((x) => x.driver_id !== merging.driver_id && x.active).map((x) => ({ id: x.driver_id, label: `${x.full_name} (${x.total_fills} fills)` }))}
          onClose={() => setMerging(null)}
          onMerged={async (n) => { setMerging(null); flash(`Merged ${n} fills`); await onChanged(); }}
        />
      )}
    </>
  );
}

// ============================================================
// TAB: FLAGGED
// ============================================================
function FlaggedTab({ snap }: { snap: DashboardSnapshot }) {
  const fills = snap.flagged;
  if (fills.length === 0) return <EmptyState text="No flagged fills. 👍" />;
  return (
    <>
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3 text-sm flex items-start gap-2">
        <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          {fills.length} flagged {fills.length === 1 ? 'fill' : 'fills'}. Check photos and either dispute with the driver or dismiss as OCR error.
        </div>
      </div>
      {fills.map((f) => <FillCard key={f.id} f={f} />)}
    </>
  );
}

// ============================================================
// TAB: TRENDS
// ============================================================
function TrendsTab() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<TrendPoint[] | null>(null);
  const [report7, setReport7]   = useState<ReportResult | null>(null);
  const [report30, setReport30] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [t, w, m] = await Promise.all([
          trendsData(days),
          report('weekly'),
          report('monthly'),
        ]);
        if (cancelled) return;
        setData(t.series);
        setReport7(w);
        setReport30(m);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const maxLiters = useMemo(() => Math.max(1, ...(data || []).map((d) => d.liters)), [data]);

  return (
    <>
      <div className="flex gap-2 mb-3">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 rounded-lg text-xs ${days === d ? 'bg-yellow text-black font-bold' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {report7 && report30 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <SummaryCard title="7 days" r={report7} />
          <SummaryCard title="30 days" r={report30} />
        </div>
      )}

      <h3 className="font-heading text-lg mb-2">Daily liters</h3>
      {loading && <div className="text-gray-500 py-4 text-sm">Loading…</div>}
      {data && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
          {data.length === 0 && <p className="text-sm text-gray-500 text-center py-6">No fills in this window.</p>}
          <div className="space-y-1">
            {data.map((d) => (
              <div key={d.date} className="flex items-center text-xs gap-2">
                <span className="w-20 text-gray-500">{d.date.slice(5)}</span>
                <div className="flex-1 h-4 bg-gray-900 rounded-sm overflow-hidden">
                  <div className="h-full bg-yellow" style={{ width: `${(d.liters / maxLiters) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-gray-300">{d.liters}L</span>
                <span className="w-12 text-right text-gray-500">{d.avg_l100 ?? '—'}</span>
                {d.flagged > 0 && <span className="text-red-400 w-4">{d.flagged}</span>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-2">date · total liters · avg L/100km · flags</p>
        </div>
      )}

      {report30 && report30.worst_trucks.length > 0 && (
        <>
          <h3 className="font-heading text-lg mt-6 mb-2">Worst trucks (30d avg L/100km)</h3>
          <div className="bg-gray-950 border border-gray-800 rounded-xl divide-y divide-gray-800">
            {report30.worst_trucks.slice(0, 5).map((t) => (
              <div key={t.truck_id} className="flex justify-between items-center px-3 py-2 text-sm">
                <span>{t.plate}</span>
                <span><span className="font-semibold">{t.avg_l100 ?? '—'}</span> <span className="text-gray-500 text-xs">L/100km · {t.fills} fills</span></span>
              </div>
            ))}
          </div>
        </>
      )}

      {report30 && report30.worst_drivers.length > 0 && (
        <>
          <h3 className="font-heading text-lg mt-6 mb-2">Worst drivers (30d avg L/100km)</h3>
          <div className="bg-gray-950 border border-gray-800 rounded-xl divide-y divide-gray-800">
            {report30.worst_drivers.slice(0, 5).map((d) => (
              <div key={d.driver_id} className="flex justify-between items-center px-3 py-2 text-sm">
                <span>{d.name}</span>
                <span><span className="font-semibold">{d.avg_l100 ?? '—'}</span> <span className="text-gray-500 text-xs">L/100km · {d.fills} fills</span></span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SummaryCard({ title, r }: { title: string; r: ReportResult }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs">
      <p className="text-gray-500 mb-1">{title}</p>
      <p><span className="text-gray-400">Fills:</span> <span className="text-white font-semibold">{r.total_fills}</span></p>
      <p><span className="text-gray-400">Liters:</span> <span className="text-white font-semibold">{r.total_liters}</span></p>
      <p><span className="text-gray-400">Cost:</span> <span className="text-white font-semibold">{r.total_cost_aed} AED</span></p>
      <p><span className="text-gray-400">Avg:</span> <span className="text-white font-semibold">{r.fleet_avg_l100 ?? '—'} L/100km</span></p>
      <p className={r.flag_count ? 'text-red-400' : 'text-green-400'}>Flags: {r.flag_count}</p>
    </div>
  );
}

// ============================================================
// TAB: LOG (paginated + filter)
// ============================================================
function LogTab() {
  const [rows, setRows] = useState<FullLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const pageSize = 50;

  const load = async () => {
    setLoading(true);
    try {
      const r = await fullLog({ limit: pageSize, offset, flagged_only: flaggedOnly || undefined });
      setRows(r.fills);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [offset, flaggedOnly]);

  return (
    <>
      <div className="flex gap-2 mb-3 items-center">
        <button
          onClick={() => { setFlaggedOnly((v) => !v); setOffset(0); }}
          className={`px-3 py-1 rounded-lg text-xs ${flaggedOnly ? 'bg-red-500 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}
        >
          Flagged only
        </button>
        <span className="text-xs text-gray-500">{total} total</span>
      </div>

      {loading && rows.length === 0 && <div className="text-gray-500 py-4 text-sm">Loading…</div>}
      <div className="space-y-2">
        {rows.map((f) => <FillCard key={f.id} f={f} />)}
      </div>

      {total > pageSize && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setOffset((x) => Math.max(0, x - pageSize))}
            disabled={offset === 0}
            className="flex-1 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            onClick={() => setOffset((x) => x + pageSize)}
            disabled={offset + pageSize >= total}
            className="flex-1 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}

// ============================================================
// NEEDS-REVIEW INBOX
// ============================================================
function NeedsReviewInbox({
  trucks, drivers, allTrucks, allDrivers, onAction,
}: {
  trucks: NeedsReviewTruck[];
  drivers: NeedsReviewDriver[];
  allTrucks: TruckStatsRow[];
  allDrivers: DriverStatsRow[];
  onAction: (msg: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-blue-500/10 border-b border-blue-500/30 px-4 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm text-blue-300 font-bold">
          🔎 {trucks.length + drivers.length} new {trucks.length + drivers.length === 1 ? 'record' : 'records'} — please review
        </span>
        <span className="text-blue-300 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {trucks.map((t) => (
            <NeedsReviewTruckRow key={t.id} truck={t} candidates={allTrucks.filter((x) => x.truck_id !== t.id && x.active).map((x) => ({ id: x.truck_id, label: `${x.plate_display} (${x.total_fills} fills)` }))} onAction={onAction} />
          ))}
          {drivers.map((d) => (
            <NeedsReviewDriverRow key={d.id} driver={d} candidates={allDrivers.filter((x) => x.driver_id !== d.id && x.active).map((x) => ({ id: x.driver_id, label: `${x.full_name} (${x.total_fills} fills)` }))} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function NeedsReviewTruckRow({ truck, candidates, onAction }: {
  truck: NeedsReviewTruck;
  candidates: { id: string; label: string }[];
  onAction: (msg: string) => Promise<void> | void;
}) {
  const [mergeTarget, setMergeTarget] = useState('');
  const confirm = async () => {
    await editTruck(truck.id, { needs_review: false });
    await onAction(`Confirmed truck ${truck.plate_display}`);
  };
  const doMerge = async () => {
    if (!mergeTarget) return;
    const r = await mergeTrucks(truck.id, mergeTarget);
    await onAction(`Merged ${r.fills_moved} fills`);
  };
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm"><TruckIcon size={12} className="inline mr-1" /> <span className="font-semibold">{truck.plate_display}</span> <span className="text-xs text-gray-500">({truck.plate_number})</span></p>
        </div>
        <button onClick={confirm} className="text-xs bg-green-600 text-white rounded-lg px-2 py-1 flex items-center gap-1">
          <Check size={12} /> Confirm
        </button>
      </div>
      <div className="flex gap-2 mt-2">
        <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="flex-1 text-xs bg-gray-900 border border-gray-700 rounded-lg px-2 py-1">
          <option value="">merge into existing…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button onClick={doMerge} disabled={!mergeTarget} className="text-xs bg-yellow text-black rounded-lg px-2 py-1 disabled:opacity-40 flex items-center gap-1">
          <GitMerge size={12} /> Merge
        </button>
      </div>
    </div>
  );
}

function NeedsReviewDriverRow({ driver, candidates, onAction }: {
  driver: NeedsReviewDriver;
  candidates: { id: string; label: string }[];
  onAction: (msg: string) => Promise<void> | void;
}) {
  const [mergeTarget, setMergeTarget] = useState('');
  const confirm = async () => {
    await editDriver(driver.id, { needs_review: false });
    await onAction(`Confirmed driver ${driver.full_name}`);
  };
  const doMerge = async () => {
    if (!mergeTarget) return;
    const r = await mergeDrivers(driver.id, mergeTarget);
    await onAction(`Merged ${r.fills_moved} fills`);
  };
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm"><User size={12} className="inline mr-1" /> <span className="font-semibold">{driver.full_name}</span> {driver.license_number && <span className="text-xs text-gray-500">· #{driver.license_number}</span>}</p>
        </div>
        <button onClick={confirm} className="text-xs bg-green-600 text-white rounded-lg px-2 py-1 flex items-center gap-1">
          <Check size={12} /> Confirm
        </button>
      </div>
      <div className="flex gap-2 mt-2">
        <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="flex-1 text-xs bg-gray-900 border border-gray-700 rounded-lg px-2 py-1">
          <option value="">merge into existing…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button onClick={doMerge} disabled={!mergeTarget} className="text-xs bg-yellow text-black rounded-lg px-2 py-1 disabled:opacity-40 flex items-center gap-1">
          <GitMerge size={12} /> Merge
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Edit + merge modals
// ============================================================
function EditTruckModal({ truck, onClose, onSaved }: { truck: TruckStatsRow; onClose: () => void; onSaved: () => void }) {
  const [display, setDisplay] = useState(truck.plate_display);
  const [nickname, setNickname] = useState(truck.nickname ?? '');
  const [active, setActive] = useState(truck.active);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setSaving(true); setErr('');
    try {
      await editTruck(truck.truck_id, { plate_display: display, nickname: nickname || null, active, needs_review: false });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };
  return (
    <ModalShell title={`Edit truck ${truck.plate_display}`} onClose={onClose}>
      <label className="block text-xs text-gray-400 mb-1 mt-2">Plate (display)</label>
      <input value={display} onChange={(e) => setDisplay(e.target.value)} className="w-full py-2 px-3 rounded-lg bg-gray-900 text-white border border-gray-700" />
      <label className="block text-xs text-gray-400 mb-1 mt-3">Nickname</label>
      <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full py-2 px-3 rounded-lg bg-gray-900 text-white border border-gray-700" />
      <label className="flex items-center gap-2 mt-3 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
      </label>
      {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2 bg-yellow text-black font-bold rounded-lg text-sm">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </ModalShell>
  );
}

function EditDriverModal({ driver, onClose, onSaved }: { driver: DriverStatsRow; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(driver.full_name);
  const [nickname, setNickname] = useState(driver.nickname ?? '');
  const [active, setActive] = useState(driver.active);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setSaving(true); setErr('');
    try {
      await editDriver(driver.driver_id, { full_name: fullName, nickname: nickname || null, active, needs_review: false });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };
  return (
    <ModalShell title={`Edit driver ${driver.full_name}`} onClose={onClose}>
      <label className="block text-xs text-gray-400 mb-1 mt-2">Full name</label>
      <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full py-2 px-3 rounded-lg bg-gray-900 text-white border border-gray-700" />
      <label className="block text-xs text-gray-400 mb-1 mt-3">Nickname</label>
      <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full py-2 px-3 rounded-lg bg-gray-900 text-white border border-gray-700" />
      <label className="flex items-center gap-2 mt-3 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
      </label>
      {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2 bg-yellow text-black font-bold rounded-lg text-sm">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </ModalShell>
  );
}

function MergeModal({
  kind, from, candidates, onClose, onMerged,
}: {
  kind: 'truck' | 'driver';
  from: { id: string; label: string };
  candidates: { id: string; label: string }[];
  onClose: () => void;
  onMerged: (fillsMoved: number) => void;
}) {
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!target) return;
    setSaving(true); setErr('');
    try {
      const r = kind === 'truck' ? await mergeTrucks(from.id, target) : await mergeDrivers(from.id, target);
      onMerged(r.fills_moved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Merge failed');
    } finally { setSaving(false); }
  };
  return (
    <ModalShell title={`Merge ${from.label} into…`} onClose={onClose}>
      <p className="text-xs text-gray-400 mt-2">All fills from <b>{from.label}</b> will move to the target, and this {kind} will be deactivated. Audit log keeps the history.</p>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full py-2 px-3 rounded-lg bg-gray-900 text-white border border-gray-700 mt-3">
        <option value="">-- select target --</option>
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button>
        <button onClick={save} disabled={!target || saving} className="flex-1 py-2 bg-yellow text-black font-bold rounded-lg text-sm disabled:opacity-40">{saving ? 'Merging…' : 'Merge'}</button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-30 flex items-end sm:items-center justify-center p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 w-full max-w-md">
        <div className="flex justify-between items-start">
          <h3 className="font-heading text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Common UI components
// ============================================================
function StatCard({ label, value, tone = 'ok' }: { label: string; value: number | string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === 'warn' ? 'bg-red-500/10 border-red-500/30' : 'bg-gray-950 border-gray-800'}`}>
      <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-heading text-2xl ${tone === 'warn' ? 'text-red-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 mb-3">
      <Search size={14} className="text-gray-500" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent text-sm focus:outline-none" />
      {value && <button onClick={() => onChange('')} className="text-gray-500"><X size={14} /></button>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-sm text-gray-500 text-center py-10">{text}</div>;
}

type FillLike = {
  id: string;
  logged_at: string;
  odometer_km?: number;
  liters_filled?: number;
  km_since_last: number | null;
  liters_per_100km: number | null;
  cost_aed: number | null;
  variance_percent: number | null;
  flagged: boolean;
  flag_reason: string | null;
  photo_plate_url?: string;
  photo_license_url?: string | null;
  photo_odometer_url?: string;
  photo_pump_url?: string;
  truck: { plate_display: string; nickname: string | null } | null;
  driver: { full_name: string; nickname: string | null } | null;
};

function FillCard({ f }: { f: FillLike }) {
  const when = relative(f.logged_at);
  const [showPhotos, setShowPhotos] = useState(false);
  return (
    <div className={`rounded-xl border mb-2 ${f.flagged ? 'bg-red-500/5 border-red-500/40' : 'bg-gray-950 border-gray-800'}`}>
      <div className="p-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-heading text-base">
              {f.truck?.plate_display || '—'}
              {f.driver && <span className="text-gray-400 text-sm font-normal"> · {f.driver.full_name}</span>}
            </p>
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
        <button
          onClick={() => setShowPhotos((v) => !v)}
          className="mt-2 text-[11px] text-gray-400 underline underline-offset-2"
        >
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

// ============================================================
// Helpers
// ============================================================
function relative(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)       return `${Math.round(s)}s ago`;
  if (s < 3600)     return `${Math.round(s / 60)}m ago`;
  if (s < 86_400)   return `${Math.round(s / 3600)}h ago`;
  if (s < 604_800)  return `${Math.round(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}
