import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// No floating WhatsApp bubble on the product detail page: /item/[id] has
// its own product-specific Negotiate CTAs (desktop inline + mobile sticky
// bar), so the generic site-wide bubble is redundant here. It stays on all
// other routes.
export default function ItemLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen">{children}</main>
      <Footer />
    </>
  );
}
