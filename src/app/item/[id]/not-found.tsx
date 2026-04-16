import Link from 'next/link';

export default function ItemNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center max-w-md">
        <h1 className="font-heading text-5xl mb-2">ITEM NOT FOUND</h1>
        <p className="text-gray-500 mb-8">
          This item may have been sold or removed from our catalog.
        </p>
        <div className="space-y-3">
          <Link
            href="/shop"
            className="block w-full bg-yellow text-black px-6 py-3 rounded-xl font-heading text-lg hover:bg-yellow/90 transition-colors text-center"
          >
            BROWSE MORE ITEMS
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
