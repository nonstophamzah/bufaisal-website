import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/appliance-tracker', '/api', '/team', '/login'],
    },
    sitemap: 'https://bufaisal.ae/sitemap.xml',
  };
}
