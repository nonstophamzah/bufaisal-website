import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/appliances', '/api', '/team', '/login'],
    },
    sitemap: 'https://bufaisal.ae/sitemap.xml',
  };
}
