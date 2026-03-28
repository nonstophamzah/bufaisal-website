import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface CategoryCardProps {
  name: string;
  slug: string;
  description: string;
  icon: LucideIcon;
  itemCount?: number;
}

export default function CategoryCard({
  name,
  slug,
  description,
  icon: Icon,
  itemCount,
}: CategoryCardProps) {
  return (
    <Link
      href={`/shop?category=${slug}`}
      className="group block bg-white border border-gray-200 rounded-xl p-6 hover:border-yellow hover:shadow-lg transition-all"
    >
      <div className="w-12 h-12 bg-yellow/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-yellow/20 transition-colors">
        <Icon size={24} className="text-yellow" />
      </div>
      <h3 className="font-heading text-xl mb-1">{name}</h3>
      <p className="text-sm text-muted mb-3">{description}</p>
      {typeof itemCount === 'number' && (
        <span className="text-xs font-medium text-yellow">
          {itemCount} items
        </span>
      )}
    </Link>
  );
}
