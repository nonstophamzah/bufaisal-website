'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';

function compressImage(file: File, maxWidth = 800, quality = 0.6): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = (h * maxWidth) / w;
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

async function uploadToCloudinary(blob: Blob): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'df8y0k626';
  const fd = new FormData();
  fd.append('file', blob, 'photo.jpg');
  fd.append('upload_preset', 'bufaisal_unsigned');
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: fd }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error('Upload failed');
  return data.secure_url;
}

interface CameraCaptureProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
}

export default function CameraCapture({ label, value, onChange }: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      alert('Photo too large. Max 10MB.');
      return;
    }
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Only image files allowed.');
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const url = await uploadToCloudinary(compressed);
      onChange(url);
    } catch {
      alert('Photo upload failed. Try again.');
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div>
      <p className="text-sm font-bold mb-1.5">{label}</p>
      {value ? (
        <div className="relative aspect-square rounded-xl overflow-hidden border-2 border-green-500 bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-lg font-bold"
          >
            &times;
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full aspect-square border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 active:border-green-500 active:text-green-500 transition-colors"
        >
          {uploading ? (
            <Loader2 size={32} className="animate-spin" />
          ) : (
            <>
              <Camera size={32} />
              <span className="text-xs mt-1 font-medium">TAP</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />
    </div>
  );
}
