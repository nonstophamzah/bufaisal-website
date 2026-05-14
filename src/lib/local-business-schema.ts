// Per-shop LocalBusiness JSON-LD blocks for the 5 Bufaisal showrooms.
// Each Google Business Profile gets its own LocalBusiness entity with its
// own geo coordinates, address, aggregateRating, and `sameAs` GBP URL —
// emitted as 5 sibling <script> tags on `/` and `/shop`.
//
// All five share a single parentOrganization cross-reference back to the
// Organization block in src/app/layout.tsx ("Bu Faisal General Trading").
//
// Data source: each shop's verified Google Business Profile.
// Shops D and E share GPS coordinates because the units are physically
// adjacent; distinct `sameAs` GBP URLs disambiguate them for Google.

const SHARED = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  telephone: '+971585932499',
  openingHours: 'Mo-Su 09:00-23:00',
  url: 'https://bufaisal.ae',
  priceRange: 'AED 50 - AED 5000',
  image: 'https://bufaisal.ae/og-image.png',
  parentOrganization: {
    '@type': 'Organization',
    name: 'Bu Faisal General Trading',
    url: 'https://bufaisal.ae',
  },
} as const;

const SHARED_ADDRESS = {
  addressLocality: 'Ajman',
  addressRegion: 'Ajman',
  postalCode: '00000',
  addressCountry: 'AE',
} as const;

export const LOCAL_BUSINESS_SCHEMAS: ReadonlyArray<Record<string, unknown>> = [
  {
    ...SHARED,
    name: 'Bu Faisal Used Furniture & Appliances - Main Branch',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Behind Safeer Hypermarket, Al Jurf 2 Askan Holding',
      ...SHARED_ADDRESS,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 25.3993497,
      longitude: 55.4986541,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 3.5,
      reviewCount: 1442,
      bestRating: 5,
      worstRating: 1,
    },
    sameAs: ['https://share.google/JEuH3Tr8MAoubmM69'],
  },
  {
    ...SHARED,
    name: 'Bu Faisal Used Furniture & Appliances - Branch 2',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Al Jurf 2, Sharia Al Khail',
      ...SHARED_ADDRESS,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 25.3991911,
      longitude: 55.4971841,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 3.7,
      reviewCount: 281,
      bestRating: 5,
      worstRating: 1,
    },
    sameAs: ['https://share.google/MsIvwoV9qzcW1DpGM'],
  },
  {
    ...SHARED,
    name: 'Bu Faisal Used Furniture & Appliances - Branch 3',
    address: {
      '@type': 'PostalAddress',
      streetAddress:
        'Al Jurf 2 Askan Holding, Shaikh Rashid Bin Abdul Aziz Aaemi Street',
      ...SHARED_ADDRESS,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 25.3993313,
      longitude: 55.4980131,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 3.3,
      reviewCount: 582,
      bestRating: 5,
      worstRating: 1,
    },
    sameAs: ['https://share.google/AZTXlZxyMeF9RSEu8'],
  },
  {
    ...SHARED,
    name: 'Bu Faisal Used Furniture & Appliances - Branch 4',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Al Khail Street, Al Jurf 2',
      ...SHARED_ADDRESS,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 25.3994663,
      longitude: 55.4993168,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 4.2,
      reviewCount: 47,
      bestRating: 5,
      worstRating: 1,
    },
    sameAs: ['https://share.google/Zq0gxkFHh3Wk9efhn'],
  },
  {
    ...SHARED,
    name: 'Bu Faisal Used Furniture & Appliances - Branch 5',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Al Khail Street, Al Jurf 2',
      ...SHARED_ADDRESS,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 25.3994663,
      longitude: 55.4993168,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 4.4,
      reviewCount: 49,
      bestRating: 5,
      worstRating: 1,
    },
    sameAs: ['https://share.google/u97fMw3hL6ocrDjfR'],
  },
];
