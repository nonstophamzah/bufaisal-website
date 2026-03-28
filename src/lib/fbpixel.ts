declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackWhatsAppClick() {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'WhatsAppClick');
  }
}
