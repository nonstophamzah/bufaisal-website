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
            <p className="text-yellow text-sm font-medium mb-4">
              {t(
                'Quality You Can Trust. Prices You\'ll Love.',
                'جودة تثق بها. أسعار تحبها.'
              )}
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-3">
              <a
                href="https://www.instagram.com/bufaisal.ae"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-yellow transition-colors"
                aria-label="Instagram"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a
                href="https://www.tiktok.com/@bufaisal.ae"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-yellow transition-colors"
                aria-label="TikTok"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13.2a8.16 8.16 0 005.58 2.17v-3.44a4.85 4.85 0 01-3.77-1.47V6.69h3.77z"/></svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-heading text-xl mb-4">{t('QUICK LINKS', 'روابط سريعة')}</h4>
            <div className="space-y-2">
              {[
                { href: '/shop', label: t('Shop All', 'تسوّق الكل') },
                { href: '/categories', label: t('Categories', 'الأقسام') },
                { href: '/about', label: t('About Us', 'من نحن') },
                { href: '/contact', label: t('Contact', 'تواصل معنا') },
                { href: '/login', label: t('Login', 'تسجيل الدخول') },
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
