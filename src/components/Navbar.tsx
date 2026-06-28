'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, Menu, X, Phone, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/lang';
import { detectCategorySlug } from '@/lib/category-search';
import TrustStrip from './TrustStrip';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { lang, toggle, t } = useLang();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = query.trim();
    if (!term) return;
    // Category-name terms (e.g. "fridge", "beds") redirect to the category page;
    // everything else runs a keyword search. Same detection the in-page search
    // uses, so both entry points behave identically.
    const slug = detectCategorySlug(term);
    router.push(
      slug
        ? `/shop?category=${slug}&redirectedFrom=${encodeURIComponent(term)}`
        : `/shop?q=${encodeURIComponent(term)}`
    );
    setSearchOpen(false);
    setQuery('');
  };

  const navLinks = [
    { href: '/', label: t('Home', 'الرئيسية') },
    { href: '/shop', label: t('Shop', 'تسوّق') },
    { href: '/categories', label: t('Categories', 'الأقسام') },
    { href: '/about', label: t('About', 'من نحن') },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="font-heading text-2xl tracking-wide text-yellow">
              BU FAISAL
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium hover:text-yellow transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Call + Search + Lang + Mobile menu */}
          <div className="flex items-center gap-2">
            {/* Call Now */}
            <a
              href="tel:+971585932499"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow text-black text-xs font-bold rounded-lg hover:bg-yellow/90 transition-colors"
              aria-label="Call now"
            >
              <Phone size={14} />
              <span className="hidden sm:inline">{t('Call', 'اتصل')}</span>
            </a>
            {/* Language toggle */}
            <button
              onClick={toggle}
              className="px-2.5 py-1 text-xs font-bold border border-gray-600 rounded-md hover:border-yellow hover:text-yellow transition-colors"
            >
              {lang === 'en' ? 'عربي' : 'EN'}
            </button>
            {/* Social icons — Section 2.17 (header, hidden on smallest mobile) */}
            <a
              href="https://www.instagram.com/bufaisal.ae"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="hidden sm:inline-flex p-2 hover:text-yellow transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </a>
            <a
              href="https://www.tiktok.com/@bufaisal.ae"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
              className="hidden sm:inline-flex p-2 hover:text-yellow transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13.2a8.16 8.16 0 005.58 2.17v-3.44a4.85 4.85 0 01-3.77-1.47V6.69h3.77z"/></svg>
            </a>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 hover:text-yellow transition-colors"
              aria-label="Search"
            >
              <Search size={20} />
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 hover:text-yellow transition-colors"
              aria-label="Menu"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <form onSubmit={handleSearch} className="pb-4">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search items...', 'ابحث عن المنتجات...')}
                className="w-full px-4 py-2 bg-dark border border-gray-700 rounded-lg text-white placeholder-muted focus:outline-none focus:border-yellow"
                autoFocus
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-yellow"
              >
                <Search size={18} />
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Trust strip — Section 2.7 (5-item, every page) */}
      <TrustStrip />

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-dark border-t border-gray-800">
          <div className="px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block text-sm font-medium hover:text-yellow transition-colors py-2"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="tel:+971585932499"
              className="block text-sm font-medium text-yellow py-2"
            >
              {t('Call: +971 58 593 2499', 'اتصل: 2499 593 58 971+')}
            </a>
            {/* Staff Login — separated from nav links by a divider */}
            <div className="pt-3 mt-1 border-t border-gray-800">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full bg-[#F9D923] text-black text-sm font-bold rounded-lg py-2.5"
              >
                <Lock size={16} />
                {t('Staff Login', 'دخول الموظفين')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
