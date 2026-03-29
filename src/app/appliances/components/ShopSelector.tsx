'use client';

const SHOPS = ['A', 'B', 'C', 'D', 'E'];

export default function ShopSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (shop: string) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {SHOPS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`py-5 rounded-xl font-heading text-2xl transition-colors active:scale-95 ${
            value === s
              ? 'bg-black text-yellow'
              : 'bg-gray-200 text-black hover:bg-gray-300'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
