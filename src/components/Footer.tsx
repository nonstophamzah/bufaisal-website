import Link from 'next/link';
import { MapPin, Phone, Clock } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="font-heading text-3xl text-yellow mb-3">BU FAISAL</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              UAE&apos;s biggest used goods souq. Serving customers since 2009
              with quality pre-owned items across 5 shops in Ajman.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-heading text-xl mb-4">QUICK LINKS</h4>
            <div className="space-y-2">
              {[
                { href: '/shop', label: 'Shop All' },
                { href: '/categories', label: 'Categories' },
                { href: '/about', label: 'About Us' },
                { href: '/team', label: 'Team Portal' },
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
            <h4 className="font-heading text-xl mb-4">VISIT US</h4>
            <div className="space-y-3 text-sm text-gray-400">
              <div className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <span>Ajman, United Arab Emirates</span>
              </div>
              <div className="flex items-start gap-2">
                <Phone size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <span>WhatsApp Available</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock size={16} className="mt-0.5 text-yellow flex-shrink-0" />
                <span>Open Daily</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Bu Faisal. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
