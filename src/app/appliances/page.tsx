'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import WorkerLogin from './components/WorkerLogin';

type Tab = 'shop' | 'jurf' | 'security';

export default function AppliancesLoginPage() {
  const [tab, setTab] = useState<Tab>('shop');
  const router = useRouter();

  const handleLogin = (worker: { name: string; role: string }) => {
    // Store worker in sessionStorage
    sessionStorage.setItem('appliance_worker', JSON.stringify(worker));

    if (worker.role === 'shop') router.push('/appliances/shop');
    else if (worker.role === 'jurf') router.push('/appliances/jurf');
    else if (worker.role === 'cleaning') router.push('/appliances/cleaning');
    else if (worker.role === 'delivery') router.push('/appliances/delivery');
    else if (worker.role === 'security') router.push('/appliances/security');
    else if (worker.role === 'manager') router.push('/appliances/manager');
  };

  const tabs: { key: Tab; label: string; roles: string[] }[] = [
    { key: 'shop', label: 'SHOP', roles: ['shop', 'delivery', 'cleaning'] },
    { key: 'jurf', label: 'JURF', roles: ['jurf'] },
    { key: 'security', label: 'SECURITY', roles: ['security'] },
  ];

  const activeTab = tabs.find((t) => t.key === tab)!;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="pt-8 pb-4 px-4 text-center">
        <h1 className="font-heading text-3xl text-yellow">BU FAISAL</h1>
        <p className="text-sm text-gray-400 mt-1">Appliance Operations</p>
      </div>

      {/* Tab bar */}
      <div className="flex mx-4 bg-gray-900 rounded-xl p-1 mb-8">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3.5 rounded-lg font-heading text-lg transition-colors ${
              tab === t.key
                ? 'bg-yellow text-black'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Worker tiles */}
      <div className="flex-1 px-4 pb-8">
        {activeTab.roles.map((role) => (
          <div key={role}>
            {activeTab.roles.length > 1 && (
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2 mt-4">
                {role}
              </p>
            )}
            <WorkerLogin role={role} onLogin={handleLogin} />
          </div>
        ))}
      </div>

      {/* Manager link */}
      <div className="px-4 pb-8 text-center">
        <Link
          href="/appliances/manager"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-yellow transition-colors"
        >
          <Settings size={16} />
          Manager Dashboard
        </Link>
      </div>
    </div>
  );
}
