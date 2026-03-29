'use client';

import Link from 'next/link';
import { MapPin, Phone, Clock, Truck, MessageCircle, ExternalLink } from 'lucide-react';
import { useLang } from '@/lib/lang';

const MAPS_URL = 'https://maps.google.com/?q=Bu+Faisal+General+Trading+Ajman';

export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
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
            <h4 className="font-heading text-xl mb-4">{t('CONTACT US', 'تواصل معنا')}</h4>
            <div className="space-y-3 text-sm">
              <a
                href="tel:+971585932499"
                className="flex items-center gap-2 text-gray-400 hover:text-yellow transition-colors"
              >
                <Phone size={16} className="text-yellow flex-shrink-0" />
                <span>+971 58 593 2499</span>
              </a>
              <a
                href="https://wa.me/971585932499"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-400 hover:text-yellow transition-colors"
              >
                <MessageCircle size={16} className="text-green-500 flex-shrink-0" />
                <span>WhatsApp</span>
              </a>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-400 hover:text-yellow transition-colors"
              >
                <MapPin size={16} className="text-yellow flex-shrink-0" />
                <span className="flex items-center gap-1">
                  {t('5 Locations in Ajman', '5 فروع في عجمان')}
                  <ExternalLink size={12} />
                </span>
              </a>
            </div>
          </div>

          {/* Hours & Delivery */}
          <div>
            <h4 className="font-heading text-xl mb-4">{t('VISIT US', 'زورونا')}</h4>
            <div className="space-y-3 text-sm text-gray-400">
              <div className="flex items-start gap-2">
                <Clock size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <div>
                  <p className="font-medium text-white">
                    {t('Open Daily 9AM – 11PM', 'مفتوح يومياً ٩ص – ١١م')}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {t('7 days a week', '٧ أيام في الأسبوع')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Truck size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <span>{t('Delivery in 24-48 hours after payment', 'توصيل خلال 24-48 ساعة بعد الدفع')}</span>
              </div>
            </div>

            {/* Call Now button */}
            <a
              href="tel:+971585932499"
              className="inline-flex items-center gap-2 mt-4 bg-yellow text-black font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-yellow/90 transition-colors"
            >
              <Phone size={16} />
              {t('Call Now', 'اتصل الآن')}
            </a>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Bu Faisal General Trading. {t('All rights reserved.', 'جميع الحقوق محفوظة.')}
        </div>
      </div>
    </footer>
  );
}
