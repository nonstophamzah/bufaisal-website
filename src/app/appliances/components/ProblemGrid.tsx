'use client';

const PROBLEMS = [
  'Compressor',
  'Motor',
  'Thermostat',
  'Door Seal',
  'Fan',
  'Control Board',
  'Wiring',
  'Pump',
  'Heating Element',
  'Other',
];

export default function ProblemGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (problem: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROBLEMS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`py-4 px-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
            value === p
              ? 'bg-orange-500 text-white ring-2 ring-offset-1 ring-orange-700'
              : 'bg-gray-200 text-black'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
