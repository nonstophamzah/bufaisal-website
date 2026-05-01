'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Home, RefreshCw, Shield, AlertTriangle } from 'lucide-react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { AdminLogin } from '../components/AdminLogin';

type Severity = 'info' | 'warn' | 'critical';
interface Alert { rule: number; severity: Severity; message: string }
interface AdminActivityRow {
  id: string;
  event_type: string;
  severity: Severity;
  user_name: string | null;
  ip: string | null;
  route: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}
interface DashboardData {
  generatedAt: string;
  alerts: Alert[];
  failedLogins: { total24h: number; topIps: { ip: string; count: number }[] };
  adminActions: AdminActivityRow[];
  apiErrors: { total24h: number; byStatus: Record<string, number> };
  trend: { date: string; success: number; failed: number }[];
}

export default function SecurityDashboardPage() {
  const { pin, setPin, user, loginError, loginLoading, handleLogin } = useAdminAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const stored = sessionStorage.getItem('admin_session');
      const token = stored ? JSON.parse(stored).token : null;
      if (!token) { setError('Not authenticated'); return; }
      const res = await fetch('/api/admin/security', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError(`Error ${res.status}`); return; }
      setData(await res.json());
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  if (!user) {
    return (
      <AdminLogin
        pin={pin} setPin={setPin}
        loginError={loginError} loginLoading={loginLoading}
        onLogin={handleLogin}
        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white pt-20 pb-16 px-4">
      <Link href="/admin" className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-xs font-bold active:scale-95 min-h-[40px]">
        <Home size={14} /> ADMIN
      </Link>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="font-heading text-4xl flex items-center gap-3">
              <Shield className="text-yellow" size={32} />
              SECURITY
            </h1>
            <p className="text-muted text-sm mt-1">
              {data ? `Refreshed ${new Date(data.generatedAt).toLocaleTimeString()}` : 'Loading…'}
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-bold disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            REFRESH
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>}

        {/* Critical alerts banner */}
        {data && data.alerts.length > 0 && (
          <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200">
              <AlertTriangle className="text-red-600" size={18} />
              <span className="font-heading text-red-700 text-sm tracking-wider">
                {data.alerts.length} ALERT{data.alerts.length === 1 ? '' : 'S'} — REVIEW
              </span>
            </div>
            <ul className="divide-y divide-red-100">
              {data.alerts.map((a, i) => (
                <li key={i} className="px-4 py-3 flex items-start gap-2 text-sm">
                  <span className={`text-xs font-bold uppercase rounded px-1.5 py-0.5 mt-0.5 ${a.severity === 'critical' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
                    {a.severity}
                  </span>
                  <span className="text-red-900">{a.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data && (
          <>
            {/* Tile grid */}
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              {/* Failed logins */}
              <div className={`rounded-xl border p-4 ${data.failedLogins.total24h >= 20 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <div className="text-xs font-bold tracking-wider text-muted">FAILED LOGINS · 24H</div>
                <div className={`text-4xl font-heading mt-1 ${data.failedLogins.total24h >= 20 ? 'text-red-600' : ''}`}>
                  {data.failedLogins.total24h}
                </div>
                {data.failedLogins.topIps.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted">
                    {data.failedLogins.topIps.map((t) => (
                      <li key={t.ip} className="flex justify-between">
                        <span className="font-mono">{t.ip}</span>
                        <span>×{t.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* API errors */}
              <div className={`rounded-xl border p-4 ${Object.keys(data.apiErrors.byStatus).some((k) => k.startsWith('5')) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <div className="text-xs font-bold tracking-wider text-muted">API ERRORS · 24H</div>
                <div className="text-4xl font-heading mt-1">{data.apiErrors.total24h}</div>
                {Object.keys(data.apiErrors.byStatus).length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {Object.entries(data.apiErrors.byStatus).sort().map(([code, n]) => (
                      <li key={code} className={`flex justify-between ${code.startsWith('5') ? 'text-red-700 font-bold' : 'text-muted'}`}>
                        <span>{code}</span><span>×{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Auth trend sparkline */}
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="text-xs font-bold tracking-wider text-muted">AUTH ATTEMPTS · 7D</div>
                <Sparkline data={data.trend} />
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>{data.trend[0]?.date.slice(5)}</span>
                  <span>{data.trend[data.trend.length - 1]?.date.slice(5)}</span>
                </div>
              </div>
            </div>

            {/* Admin actions table */}
            <div className="rounded-xl border border-gray-200 mb-6">
              <div className="px-4 py-3 border-b border-gray-200 text-xs font-bold tracking-wider text-muted">
                ADMIN ACTIVITY · 24H ({data.adminActions.length})
              </div>
              <div className="max-h-96 overflow-y-auto">
                {data.adminActions.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted text-center">No activity in the last 24 hours.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-muted">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold">TIME</th>
                        <th className="text-left px-3 py-2 font-bold">EVENT</th>
                        <th className="text-left px-3 py-2 font-bold">USER</th>
                        <th className="text-left px-3 py-2 font-bold">IP</th>
                        <th className="text-left px-3 py-2 font-bold">DETAILS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.adminActions.map((row) => (
                        <tr key={row.id} className={`border-t border-gray-100 ${row.event_type === 'new_admin_ip' ? 'bg-orange-50' : ''}`}>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{new Date(row.created_at).toLocaleTimeString()}</td>
                          <td className="px-3 py-2">{row.event_type}</td>
                          <td className="px-3 py-2">{row.user_name ?? '—'}</td>
                          <td className="px-3 py-2 font-mono">{row.ip ?? '—'}</td>
                          <td className="px-3 py-2 text-muted truncate max-w-xs">
                            {row.details ? JSON.stringify(row.details) : (row.route ?? '')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Backup widget — visible-gap design */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 text-xs font-bold tracking-wider text-muted">
                BACKUPS
              </div>
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-sm font-bold mb-1">Supabase managed backups</div>
                <a href="https://supabase.com/dashboard/project/_/database/backups" target="_blank" rel="noopener noreferrer" className="text-yellow underline text-sm">
                  Open Supabase backup dashboard ↗
                </a>
                <p className="text-xs text-muted mt-1">Verify these are running on your tier.</p>
              </div>
              <div className="px-4 py-3 bg-red-50">
                <div className="text-sm font-bold text-red-700 mb-1">Off-site backup strategy</div>
                <div className="text-red-700 text-sm">❌ NOT CONFIGURED — gap.</div>
                <p className="text-xs text-red-600 mt-1">
                  Recommend: weekly <code>pg_dump</code> → S3 / Backblaze.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: { date: string; success: number; failed: number }[] }) {
  const W = 240, H = 60, P = 4;
  const max = Math.max(1, ...data.flatMap((d) => [d.success, d.failed]));
  const xs = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, data.length - 1);
  const ys = (v: number) => H - P - (v * (H - 2 * P)) / max;
  const successPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(d.success)}`).join(' ');
  const failedPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(d.failed)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16 mt-2">
      <path d={successPath} fill="none" stroke="#16a34a" strokeWidth="2" />
      <path d={failedPath} fill="none" stroke="#dc2626" strokeWidth="2" />
      {data.map((d, i) => (
        <g key={d.date}>
          <circle cx={xs(i)} cy={ys(d.success)} r="2" fill="#16a34a" />
          <circle cx={xs(i)} cy={ys(d.failed)} r="2" fill="#dc2626" />
        </g>
      ))}
    </svg>
  );
}
