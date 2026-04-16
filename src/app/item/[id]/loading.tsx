export default function ItemLoading() {
  return (
    <div className="pt-20 pb-16 max-w-4xl mx-auto px-4">
      <div className="animate-pulse space-y-6">
        {/* Image skeleton */}
        <div className="bg-gray-100 rounded-2xl aspect-square max-w-lg mx-auto" />

        {/* Title + price */}
        <div className="space-y-3">
          <div className="h-7 bg-gray-100 rounded w-3/4" />
          <div className="h-9 bg-gray-100 rounded w-1/4" />
        </div>

        {/* Details */}
        <div className="space-y-2">
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
          <div className="h-4 bg-gray-100 rounded w-1/3" />
        </div>

        {/* WhatsApp button skeleton */}
        <div className="h-14 bg-gray-100 rounded-xl w-full" />
      </div>
    </div>
  );
}
