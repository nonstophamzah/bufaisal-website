'use client';

const STATUSES = [
  { value: 'Working', color: 'bg-green-500 text-white', label: 'WORKING' },
  { value: 'Not Working', color: 'bg-red-500 text-white', label: 'NOT WORKING' },
  { value: 'Pending Scrap', color: 'bg-gray-500 text-white', label: 'PENDING SCRAP' },
];

export default function StatusSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (status: string) => void;
}) {
  return (
    <div className="space-y-3">
      {STATUSES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={`w-full py-5 rounded-xl font-heading text-2xl transition-all active:scale-95 ${
            value === s.value
              ? `${s.color} ring-4 ring-offset-2 ring-black`
              : 'bg-gray-200 text-black'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
