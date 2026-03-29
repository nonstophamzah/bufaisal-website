'use client';

import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import { useLang } from '@/lib/lang';

interface HeroProps {
  title?: string;
  subtitle?: string;
}

export default function Hero({ title, subtitle }: HeroProps) {
  const { t } = useLang();

  return (
    <section className="relative bg-black text-white pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-4 fade-up">
            <span className="text-yellow font-medium text-sm tracking-widest uppercase">
              {t('Since 2009 — First Come, First Serve', 'منذ 2009 — الأسبقية للحضور')}
            </span>
          </div>
          <h1 className="font-heading text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-none mb-3 fade-up fade-up-delay-1">
            {title || (
              <>
                {t("UAE'S LARGEST", 'أكبر سوق')}{' '}
                <span className="text-yellow">
                  {t('SECOND-HAND', 'للمستعمل')}
                </span>{' '}
                {t('MARKET', 'في الإمارات')}
              </>
            )}
          </h1>
          <p className="text-yellow/80 font-heading text-2xl md:text-3xl mb-4 fade-up fade-up-delay-1">
            أكبر سوق للمستعمل في الإمارات
          </p>
          <p className="text-gray-400 text-lg md:text-xl max-w-xl mb-4 fade-up fade-up-delay-2">
            {subtitle ||
              t(
                'Quality You Can Trust. Prices You\'ll Love. Used & brand new furniture, appliances, and more.',
                'جودة تثق بها. أسعار تحبها. أثاث وأجهزة مستعملة وجديدة.'
              )}
          </p>
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-8 fade-up fade-up-delay-2">
            <MapPin size={14} className="text-yellow" />
            <span>{t('5 Locations in Ajman', '5 فروع في عجمان')}</span>
            <span className="text-gray-600 mx-1">|</span>
            <span>{t('Delivery in 24-48 hours', 'توصيل خلال 24-48 ساعة')}</span>
          </div>
          <div className="flex flex-wrap gap-4 fade-up fade-up-delay-3">
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-yellow text-black px-6 py-3 rounded-lg font-semibold hover:bg-yellow/90 transition-colors"
            >
              {t('Browse Items', 'تصفح المنتجات')}
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/categories"
              className="inline-flex items-center gap-2 border border-gray-600 px-6 py-3 rounded-lg font-semibold hover:border-yellow hover:text-yellow transition-colors"
            >
              {t('View Categories', 'عرض الأقسام')}
            </Link>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
