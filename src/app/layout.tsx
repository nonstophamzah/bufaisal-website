import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Bebas_Neue, DM_Sans } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { LangProvider } from '@/lib/lang';
import PageViewTracker from '@/components/PageViewTracker';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import MicrosoftClarity from '@/components/MicrosoftClarity';

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
  maximumScale: 1,
  userScalable: false,
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
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: "Bu Faisal - UAE's Largest Used Goods Market" }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Bu Faisal | UAE's Largest Second-Hand Market",
    description: "UAE's largest used goods market since 2009. Browse thousands of used furniture, appliances, and household items. 5 showrooms, 24-48hr delivery.",
    images: ['/og-default.png'],
  },
  alternates: {
    canonical: '/',
  },
};

const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Analytics 4 — public routes only (see GoogleAnalytics.tsx) */}
        <GoogleAnalytics />
        {/* Microsoft Clarity — public routes only (see MicrosoftClarity.tsx) */}
        <MicrosoftClarity />
        {/* Facebook Pixel */}
        {/*
          NOTE: the standard <noscript><img src=".../tr?ev=PageView&noscript=1"> fallback
          is deliberately NOT rendered here. React Float hoists an
          <link rel="preload" as="image"> for any <img> it sees — including one inside
          <noscript> — so the browser actually FETCHES that tracking pixel on every
          JS-enabled page load. That produced a second, parameter-less ev=PageView per
          load (Meta Events Manager: 11.8K PageView on 2026-08-16 vs 1,214 GA4 users,
          plus "No event parameters were detected" for PageView). Do not re-add the
          noscript img.

          The inline #fb-pixel script below now only calls fbq('init') — it does NOT
          fire PageView. PageViewTracker is the single source of PageView for both
          Meta and GA4; having the bootstrap fire one too double-counted every real
          page load. Do not re-add fbq('track', 'PageView') here.
        */}
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
                `,
              }}
            />
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
            logo: 'https://bufaisal.ae/icon-512.png',
            foundingDate: '2009',
            description: "UAE's largest second-hand market since 2009. 5 showrooms in Ajman.",
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Behind Safeer Hypermarket, Al Jurf 2 Askan Holding',
              addressLocality: 'Ajman',
              addressRegion: 'Ajman',
              postalCode: '00000',
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
