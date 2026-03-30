'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function PlaceholderPage() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4">
      <p className="font-heading text-3xl text-gray-300 mb-4">COMING SOON</p>
      <button onClick={() => router.push('/appliances/select')} className="flex items-center gap-2 text-gray-500">
        <ArrowLeft size={18} /> Back to selection
      </button>
    </div>
  );
}
