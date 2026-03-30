'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function AppliancesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const handleLogout = () => {
    sessionStorage.removeItem('app_worker');
    sessionStorage.removeItem('app_code');
    router.replace('/appliances');
  };

  return (
    <div className="min-h-screen bg-gray-50 font-body">
      <header className="bg-black text-white flex items-center justify-between px-4 h-14">
        <span className="font-heading text-xl text-yellow tracking-wide">BU FAISAL TRACKER</span>
        <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-white" aria-label="Logout">
          <LogOut size={20} />
        </button>
      </header>
      {children}
    </div>
  );
}
