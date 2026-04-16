'use client';

import { MessageCircle } from 'lucide-react';
import { getWhatsAppGeneralUrl } from '@/lib/constants';
import { trackContactClick } from '@/lib/fbpixel';

export default function WhatsAppFloat() {
  return (
    <a
      href={getWhatsAppGeneralUrl()}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackContactClick()}
      className="fixed bottom-24 md:bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white shadow-lg whatsapp-pulse transition-colors"
      aria-label="Contact on WhatsApp"
    >
      <MessageCircle size={28} />
    </a>
  );
}
