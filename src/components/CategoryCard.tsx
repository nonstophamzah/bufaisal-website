import Link from 'next/link';
import Image from 'next/image';
import { LucideIcon } from 'lucide-react';

interface CategoryCardProps {
  name: string;
  slug: string;
  description: string;
  icon: LucideIcon;
  image?: string;
  itemCount?: number;
}

export default function CategoryCard({
  name,
  slug,
  description,
  icon: Icon,
  image,
  itemCount,
}: CategoryCardProps) {
  if (image) {
    return (
      <Link
        href={`/shop?category=${slug}`}
        className="group relative block overflow-hidden rounded-2xl aspect-[3/2] hover:shadow-lg transition-all"
      >
        <Image
          src={image}
          alt={name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
          <h3 className="font-heading text-xl sm:text-2xl text-white leading-tight">
            {name.toUpperCase()}
          </h3>
          <p className="text-white/70 text-xs sm:text-sm mt-0.5 line-clamp-1">
            {description}
          </p>
          {typeof itemCount === 'number' && (
            <span className="text-yellow text-xs font-bold mt-1 inline-block">
              {itemCount} items
            </span>
          )}
        </div>
      </Link>
    );
  }

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
