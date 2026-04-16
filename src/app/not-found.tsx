import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center max-w-md">
        <h1 className="font-heading text-7xl text-yellow mb-2">404</h1>
        <h2 className="font-heading text-2xl mb-4">PAGE NOT FOUND</h2>
        <p className="text-gray-500 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="space-y-3">
          <Link
            href="/shop"
            className="block w-full bg-yellow text-black px-6 py-3 rounded-xl font-heading text-lg hover:bg-yellow/90 transition-colors text-center"
          >
            BROWSE SHOP
          </Link>
          <Link
            href="/"
            className="block w-full bg-gray-100 text-black px-6 py-3 rounded-xl font-heading text-lg hover:bg-gray-200 transition-colors text-center"
          >
            GO HOME
          </Link>
        </div>
      </div>
    </div>
  );
}
