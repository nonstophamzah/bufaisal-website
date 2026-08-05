import type { MetadataRoute } from 'next';

// App-router web manifest. Next serves this at /manifest.webmanifest and injects
// the <link rel="manifest">. Icons live in /public; favicon.ico + icon.png +
// apple-icon.png are handled by the file conventions in src/app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bu Faisal General Trading',
    short_name: 'Bu Faisal',
    description: "UAE's largest used goods market since 2009. 5 showrooms in Ajman.",
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
