'use client';

import { useRef, useState } from 'react';
import { Camera as CameraIcon, Loader2, RotateCcw, ArrowRight } from 'lucide-react';
import { uploadToCloudinary } from '../lib/upload';

function compress(file: File, maxW = 800, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxW) { h = (h * maxW) / w; w = maxW; }
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('No canvas'));
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Compress failed')), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Load failed'));
    img.src = URL.createObjectURL(file);
  });
}

export default function CameraCapture({
  onDone,
  onBack,
}: {
  onDone: (url: string) => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setError('File too large (max 15MB)'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  };

  const handleUse = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const blob = await compress(file);
      const url = await uploadToCloudinary(blob);
      onDone(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploading(false);
  };

  if (preview) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="max-h-[60vh] rounded-2xl" />
        </div>
        {error && <p className="text-red-400 text-center text-sm mb-2">{error}</p>}
        <div className="flex gap-3 p-4 pb-8">
          <button
            onClick={() => { setPreview(null); setFile(null); inputRef.current?.click(); }}
            className="flex-1 py-4 rounded-2xl bg-gray-700 text-white font-bold text-lg flex items-center justify-center gap-2"
          >
            <RotateCcw size={20} /> Retake
          </button>
          <button
            onClick={handleUse}
            disabled={uploading}
            className="flex-1 py-4 rounded-2xl bg-green-500 text-white font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
            {uploading ? 'Uploading...' : 'Use Photo'}
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleCapture} className="hidden" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <p className="text-white font-heading text-3xl mb-8">TAKE PHOTO</p>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-40 h-40 rounded-full bg-yellow flex items-center justify-center active:scale-95 transition-transform mb-6"
      >
        <CameraIcon size={64} className="text-black" />
      </button>
      <p className="text-gray-500 text-sm mb-4">Tap to open camera</p>
      <button onClick={onBack} className="text-gray-500 text-sm">Cancel</button>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleCapture} className="hidden" />
    </div>
  );
}
