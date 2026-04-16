import { Metadata } from 'next';
import { MapPin, Phone, Clock } from 'lucide-react';
import ContactWhatsApp from './contact-wa';

export const metadata: Metadata = {
  title: 'Contact Us — Bu Faisal',
  description:
    'Get in touch with Bu Faisal. Visit our 5 showrooms in Ajman or message us on WhatsApp. Open daily 9AM–9PM.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white pt-20 pb-16">
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
            <p className="text-sm text-muted">5 Showrooms, Ajman, UAE</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-5 text-center">
            <Clock size={24} className="mx-auto mb-2 text-yellow" />
            <p className="font-heading text-sm mb-1">HOURS</p>
            <p className="text-sm text-muted">Open Daily 9AM – 9PM</p>
          </div>
        </div>

        {/* Google Maps */}
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d28854.27590605638!2d55.43!3d25.41!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3e5f5f1c7b3b8b8b%3A0x1!2sAjman%20-%20United%20Arab%20Emirates!5e0!3m2!1sen!2s!4v1700000000000"
            width="100%"
            height="350"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Bu Faisal location in Ajman, UAE"
          />
        </div>
      </div>
    </div>
  );
}
