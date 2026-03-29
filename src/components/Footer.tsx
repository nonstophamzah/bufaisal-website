'use client';

import Link from 'next/link';
import { MapPin, Phone, Clock, Truck } from 'lucide-react';
import { useLang } from '@/lib/lang';

export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="font-heading text-3xl text-yellow mb-3">BU FAISAL</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-3">
              {t(
                "UAE's largest second-hand market. Serving UAE families since 2009 — Delivery across Dubai, Ajman & Sharjah.",
                'أكبر سوق للمستعمل في الإمارات. نخدم العائلات منذ 2009 — توصيل في دبي وعجمان والشارقة.'
              )}
            </p>
            <p className="text-yellow text-sm font-medium">
              {t(
                'Quality You Can Trust. Prices You\'ll Love.',
                'جودة تثق بها. أسعار تحبها.'
              )}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-heading text-xl mb-4">{t('QUICK LINKS', 'روابط سريعة')}</h4>
            <div className="space-y-2">
              {[
                { href: '/shop', label: t('Shop All', 'تسوّق الكل') },
                { href: '/categories', label: t('Categories', 'الأقسام') },
                { href: '/about', label: t('About Us', 'من نحن') },
                { href: '/team', label: t('Team Portal', 'بوابة الفريق') },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-gray-400 hover:text-yellow transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-heading text-xl mb-4">{t('VISIT US', 'زورونا')}</h4>
            <div className="space-y-3 text-sm text-gray-400">
              <div className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <span>{t('5 Locations in Ajman, UAE', '5 فروع في عجمان، الإمارات')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Phone size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <span>{t('WhatsApp Available', 'واتساب متاح')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <span>{t('Open Daily', 'مفتوح يومياً')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Truck size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <span>{t('Delivery in 24-48 hours after payment', 'توصيل خلال 24-48 ساعة بعد الدفع')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Bu Faisal General Trading. {t('All rights reserved.', 'جميع الحقوق محفوظة.')}
        </div>
      </div>
    </footer>
  );
}
