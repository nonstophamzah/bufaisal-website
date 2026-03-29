'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, Menu, X, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/lang';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { lang, toggle, t } = useLang();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/shop?q=${encodeURIComponent(query.trim())}`);
      setSearchOpen(false);
      setQuery('');
    }
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
          </div>
        </div>
      )}
    </nav>
  );
}
