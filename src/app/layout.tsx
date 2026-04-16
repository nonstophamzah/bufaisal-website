import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Bebas_Neue, DM_Sans } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { LangProvider } from '@/lib/lang';
import PageViewTracker from '@/components/PageViewTracker';

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
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://bufaisal.ae'),
  title: "Bu Faisal | UAE's Largest Second-Hand Market",
  description:
    "UAE's largest used goods market since 2009. Browse thousands of used furniture, appliances, and household items. 5 showrooms, 24-48hr delivery.",
  keywords: [
    'Bu Faisal', 'second hand UAE', 'used furniture Ajman', 'second hand market UAE',
    'used appliances Dubai', 'pre-owned furniture Sharjah', 'Bu Faisal General Trading', 'bufaisal',
  ],
  openGraph: {
    title: "Bu Faisal | UAE's Largest Second-Hand Market",
    description: "UAE's largest used goods market since 2009. Browse thousands of used furniture, appliances, and household items. 5 showrooms, 24-48hr delivery.",
    siteName: 'Bu Faisal', type: 'website', url: 'https://bufaisal.ae',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Bu Faisal - UAE\'s Largest Second-Hand Market' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Bu Faisal | UAE's Largest Second-Hand Market",
    description: "UAE's largest used goods market since 2009. Browse thousands of used furniture, appliances, and household items. 5 showrooms, 24-48hr delivery.",
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: '/',
  },
};

const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Analytics 4 */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script
              id="ga4-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: true });
                `,
              }}
            />
          </>
        )}
        {/* Facebook Pixel */}
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
              <img height="1" width="1" style={{ display: 'none' }}
                src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`} alt="" />
            </noscript>
          </>
        )}
      </head>
      <body className={`${bebasNeue.variable} ${dmSans.variable} font-body antialiased bg-white text-black`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Bu Faisal General Trading',
            url: 'https://bufaisal.ae',
            logo: 'https://bufaisal.ae/og-image.png',
            foundingDate: '2009',
            description: "UAE's largest second-hand market since 2009. 5 showrooms in Ajman.",
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Ajman',
              addressCountry: 'AE',
            },
            contactPoint: {
              '@type': 'ContactPoint',
              telephone: '+971585932499',
              contactType: 'sales',
              availableLanguage: ['English', 'Arabic'],
            },
            sameAs: [
              'https://www.instagram.com/bufaisal.ae',
              'https://www.tiktok.com/@bufaisal.ae',
            ],
          }).replace(/</g, '\\u003c') }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Bu Faisal',
            url: 'https://bufaisal.ae',
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: 'https://bufaisal.ae/shop?q={search_term_string}',
              },
              'query-input': 'required name=search_term_string',
            },
          }).replace(/</g, '\\u003c') }}
        />
        <LangProvider>
          <Suspense fallback={null}>
            <PageViewTracker />
          </Suspense>
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
