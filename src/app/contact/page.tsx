import { Metadata } from 'next';
import { MapPin, Phone, Clock } from 'lucide-react';
import ContactWhatsApp from './contact-wa';

export const metadata: Metadata = {
  title: 'Contact Us — Bu Faisal',
  description:
    'Get in touch with Bu Faisal. Visit our 5 showrooms in Ajman or message us on WhatsApp. Open daily 9AM–11PM.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="font-heading text-4xl md:text-5xl text-center mb-2">CONTACT US</h1>
        <p className="text-center text-muted mb-10">We&apos;d love to hear from you</p>

        {/* WhatsApp CTA */}
        <ContactWhatsApp />

        {/* Info cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-gray-50 rounded-xl p-5 text-center">
            <Phone size={24} className="mx-auto mb-2 text-yellow" />
            <p className="font-heading text-sm mb-1">CALL US</p>
            <a href="tel:+971585932499" className="text-sm text-muted hover:text-black transition-colors">
              +971 58 593 2499
            </a>
          </div>
          <div className="bg-gray-50 rounded-xl p-5 text-center">
            <MapPin size={24} className="mx-auto mb-2 text-yellow" />
            <p className="font-heading text-sm mb-1">VISIT US</p>
            <p className="text-sm text-muted">
              Bu Faisal General Trading
              <br />
              Ajman, UAE
              <br />
              5 Showrooms
            </p>
            <a
              href="https://maps.google.com/?q=Bu+Faisal+General+Trading+Ajman+UAE"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-sm font-bold text-black bg-yellow px-4 py-2 rounded-lg hover:bg-yellow/90 transition-colors"
            >
              Get Directions
            </a>
          </div>
          <div className="bg-gray-50 rounded-xl p-5 text-center">
            <Clock size={24} className="mx-auto mb-2 text-yellow" />
            <p className="font-heading text-sm mb-1">HOURS</p>
            <p className="text-sm text-muted">Open Daily 9AM – 11PM</p>
          </div>
        </div>

      </div>
    </div>
  );
}
