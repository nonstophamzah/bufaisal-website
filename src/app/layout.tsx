import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, DM_Sans } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import WhatsAppFloat from '@/components/WhatsAppFloat';
import { LangProvider } from '@/lib/lang';

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

export const viewport: Viewport = {
  themeColor: '#000000',
};

export const metadata: Metadata = {
  title: "Bu Faisal General Trading | UAE's Biggest Used Goods Souq",
  description:
    "Shop quality second-hand furniture, appliances & home goods in Ajman, UAE. Since 2009.",
  keywords: [
    'Bu Faisal',
    'used goods UAE',
    'second hand Ajman',
    'used furniture UAE',
    'pre-owned appliances',
    'souq Ajman',
    'bufaisal',
    'Bu Faisal General Trading',
  ],
  openGraph: {
    title: "Bu Faisal General Trading | UAE's Biggest Used Goods Souq",
    description:
      "Shop quality second-hand furniture, appliances & home goods in Ajman, UAE. Since 2009.",
    siteName: 'Bu Faisal',
    type: 'website',
  },
};

const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {FB_PIXEL_ID && (
          <>
            <Script
              id="fb-pixel"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  !function(f,b,e,v,n,t,s)
                  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                  n.queue=[];t=b.createElement(e);t.async=!0;
                  t.src=v;s=b.getElementsByTagName(e)[0];
                  s.parentNode.insertBefore(t,s)}(window, document,'script',
                  'https://connect.facebook.net/en_US/fbevents.js');
                  fbq('init', '${FB_PIXEL_ID}');
                  fbq('track', 'PageView');
                `,
              }}
            />
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: 'none' }}
                src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        )}
      </head>
      <body
        className={`${bebasNeue.variable} ${dmSans.variable} font-body antialiased bg-white text-black`}
      >
        <LangProvider>
          <Navbar />
          <main className="min-h-screen">{children}</main>
          <Footer />
          <WhatsAppFloat />
        </LangProvider>
      </body>
    </html>
  );
}
