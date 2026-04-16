'use client';

import { MessageCircle } from 'lucide-react';
import { trackContactClick } from '@/lib/fbpixel';

export default function ContactWhatsApp() {
  return (
    <a
      href="https://wa.me/971585932499?text=Hi!%20I%20have%20a%20question%20about%20Bu%20Faisal."
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackContactClick()}
      className="flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white font-bold text-lg py-4 rounded-xl transition-colors mb-10"
    >
      <MessageCircle size={24} />
      Message Us on WhatsApp
    </a>
  );
}
