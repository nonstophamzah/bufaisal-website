'use client';

const TYPES = [
  'Fridge',
  'Washing Machine',
  'AC',
  'Microwave',
  'Stove/Oven',
  'Dishwasher',
  'Water Dispenser',
  'Blender/Mixer',
  'Fan/Heater',
  'TV',
  'Vacuum',
  'Other',
];

export default function ProductTypeGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (type: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`py-4 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
            value === t
              ? 'bg-black text-yellow ring-2 ring-offset-1 ring-yellow'
              : 'bg-gray-200 text-black'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
