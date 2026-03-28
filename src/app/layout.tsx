import type { Metadata } from 'next';
import { Bebas_Neue, DM_Sans } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import WhatsAppFloat from '@/components/WhatsAppFloat';

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bu Faisal | UAE\'s Biggest Used Goods Souq',
  description:
    'Bu Faisal is the UAE\'s largest used goods marketplace in Ajman. Shop quality pre-owned furniture, appliances, clothing, and more across 5 stores since 2009.',
  keywords: [
    'Bu Faisal',
    'used goods UAE',
    'second hand Ajman',
    'used furniture UAE',
    'pre-owned appliances',
    'souq Ajman',
    'bufaisal',
  ],
  openGraph: {
    title: 'Bu Faisal | UAE\'s Biggest Used Goods Souq',
    description:
      'Shop quality pre-owned furniture, appliances, clothing, and more across 5 stores in Ajman since 2009.',
    siteName: 'Bu Faisal',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${bebasNeue.variable} ${dmSans.variable} font-body antialiased bg-white text-black`}
      >
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <WhatsAppFloat />
      </body>
    </html>
  );
}
