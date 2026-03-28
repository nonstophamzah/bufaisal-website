import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative bg-black text-white pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="max-w-3xl">
          <p className="text-yellow font-medium text-sm tracking-widest uppercase mb-4 fade-up">
            Since 2009 &bull; Ajman, UAE
          </p>
          <h1 className="font-heading text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-none mb-6 fade-up fade-up-delay-1">
            UAE&apos;S BIGGEST{' '}
            <span className="text-yellow">USED GOODS</span> SOUQ
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-xl mb-8 fade-up fade-up-delay-2">
            Quality pre-owned furniture, appliances, clothing, and more across 5
            shops. Find amazing deals every day.
          </p>
          <div className="flex flex-wrap gap-4 fade-up fade-up-delay-3">
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-yellow text-black px-6 py-3 rounded-lg font-semibold hover:bg-yellow/90 transition-colors"
            >
              Browse Items
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/categories"
              className="inline-flex items-center gap-2 border border-gray-600 px-6 py-3 rounded-lg font-semibold hover:border-yellow hover:text-yellow transition-colors"
            >
              View Categories
            </Link>
          </div>
        </div>
      </div>
      {/* Decorative gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
