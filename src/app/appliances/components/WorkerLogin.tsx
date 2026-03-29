'use client';

import { useState, useEffect } from 'react';
import { Loader2, Delete } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Worker {
  id: string;
  name: string;
  pin: string;
  role: string;
}

export default function WorkerLogin({
  role,
  onLogin,
}: {
  role: string;
  onLogin: (worker: { name: string; role: string }) => void;
}) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Worker | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('appliance_workers')
        .select('*')
        .eq('role', role)
        .order('name');
      setWorkers(data || []);
      setLoading(false);
    })();
  }, [role]);

  const handlePinDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);

    if (next.length === 4 && selected) {
      if (next === selected.pin) {
        onLogin({ name: selected.name, role: selected.role });
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 800);
      }
    }
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={36} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // Step 1: select worker
  if (!selected) {
    return (
      <div className="space-y-3">
        {workers.map((w) => (
          <button
            key={w.id}
            onClick={() => setSelected(w)}
            className="w-full py-5 bg-white border-2 border-gray-200 rounded-2xl font-heading text-2xl active:scale-95 transition-transform hover:border-black"
          >
            {w.name.toUpperCase()}
          </button>
        ))}
        {workers.length === 0 && (
          <p className="text-center text-gray-400 py-10">No workers found for this role.</p>
        )}
      </div>
    );
  }

  // Step 2: PIN pad
  return (
    <div className="max-w-xs mx-auto">
      <button
        onClick={() => {
          setSelected(null);
          setPin('');
        }}
        className="text-sm text-gray-500 mb-4"
      >
        &larr; Back
      </button>
      <p className="font-heading text-2xl text-center mb-6">{selected.name.toUpperCase()}</p>

      {/* PIN dots */}
      <div className="flex justify-center gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full transition-colors ${
              error
                ? 'bg-red-500'
                : i < pin.length
                  ? 'bg-black'
                  : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
      {error && (
        <p className="text-red-500 text-center text-sm font-bold mb-2">Wrong PIN</p>
      )}

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(
          (key) =>
            key === '' ? (
              <div key="empty" />
            ) : key === 'del' ? (
              <button
                key="del"
                onClick={handleDelete}
                className="py-4 rounded-xl bg-gray-100 flex items-center justify-center active:bg-gray-200"
              >
                <Delete size={24} />
              </button>
            ) : (
              <button
                key={key}
                onClick={() => handlePinDigit(key)}
                className="py-4 rounded-xl bg-gray-100 font-heading text-2xl active:bg-gray-300 transition-colors"
              >
                {key}
              </button>
            )
        )}
      </div>
    </div>
  );
}
