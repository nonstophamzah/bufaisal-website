'use client';

import { useState, useRef } from 'react';
import { Upload, Sparkles, Loader2, LogOut, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, SHOPS } from '@/lib/constants';

const TEAM_PINS: Record<string, string> = {
  '1111': 'Imran',
  '2222': 'Foysal',
  '3333': 'Humaan',
  '0000': 'Admin',
};

export default function TeamPage() {
  const [pin, setPin] = useState('');
  const [user, setUser] = useState('');
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    item_name: '',
    brand: '',
    description: '',
    category: CATEGORIES[0].name,
    sale_price: '',
    shop_source: SHOPS[0].id,
    barcode: '',
    product_type: '',
  });

  const handleLogin = () => {
    const name = TEAM_PINS[pin];
    if (name) {
      setUser(name);
      setError('');
    } else {
      setError('Invalid PIN');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError('');
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const newUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('file', files[i]);
      formData.append('upload_preset', 'bufaisal_unsigned');

      try {
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: 'POST', body: formData }
        );
        const data = await res.json();
        if (data.secure_url) {
          newUrls.push(data.secure_url);
          if (!thumbnailUrl && i === 0) {
            setThumbnailUrl(data.secure_url);
          }
        }
      } catch {
        setError('Failed to upload image');
      }
    }

    setImageUrls((prev) => [...prev, ...newUrls]);
    setUploading(false);
  };

  const handleGeminiAI = async () => {
    if (imageUrls.length === 0) {
      setError('Upload a photo first');
      return;
    }

    setAiLoading(true);
    setError('');

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      const imageUrl = imageUrls[0];

      // Fetch image as base64
      const imgRes = await fetch(imageUrl);
      const blob = await imgRes.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      });

      const mimeType = blob.type || 'image/jpeg';

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Analyze this image of a used item for sale. Return a JSON object with these fields:
- item_name: a clear, concise name for this item
- brand: the brand if visible, or "Unknown"
- description: a short 1-2 sentence description of the item's condition and features
- category: one of these exact values: ${CATEGORIES.map((c) => `"${c.name}"`).join(', ')}

Return ONLY the JSON object, no other text.`,
                  },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64,
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      const data = await res.json();
      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setForm((prev) => ({
          ...prev,
          item_name: parsed.item_name || prev.item_name,
          brand: parsed.brand || prev.brand,
          description: parsed.description || prev.description,
          category: parsed.category || prev.category,
        }));
      }
    } catch {
      setError('AI analysis failed. Please fill in details manually.');
    }

    setAiLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item_name || !form.sale_price) {
      setError('Item name and price are required');
      return;
    }

    setError('');
    setUploading(true);

    const { error: dbError } = await supabase.from('shop_items').insert({
      item_name: form.item_name,
      brand: form.brand || null,
      product_type: form.product_type || null,
      description: form.description || null,
      category: form.category,
      sale_price: parseFloat(form.sale_price),
      shop_source: form.shop_source,
      barcode: form.barcode || null,
      image_urls: imageUrls,
      thumbnail_url: thumbnailUrl || null,
      uploaded_by: user,
      is_published: false,
      is_sold: false,
    });

    if (dbError) {
      setError(dbError.message);
    } else {
      setSuccess('Item uploaded successfully! Awaiting admin approval.');
      setForm({
        item_name: '',
        brand: '',
        description: '',
        category: CATEGORIES[0].name,
        sale_price: '',
        shop_source: SHOPS[0].id,
        barcode: '',
        product_type: '',
      });
      setImageUrls([]);
      setThumbnailUrl('');
    }

    setUploading(false);
  };

  // PIN login screen
  if (!user) {
    return (
      <div className="pt-20 pb-16 flex items-center justify-center min-h-screen">
        <div className="max-w-sm w-full mx-4">
          <h1 className="font-heading text-4xl text-center mb-2">
            TEAM <span className="text-yellow">PORTAL</span>
          </h1>
          <p className="text-muted text-center mb-8 text-sm">
            Enter your PIN to access the upload panel
          </p>

          <div className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Enter 4-digit PIN"
              className="w-full text-center text-2xl tracking-[0.5em] px-4 py-4 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
            />
            <button
              onClick={handleLogin}
              className="w-full bg-yellow text-black font-semibold py-3 rounded-xl hover:bg-yellow/90 transition-colors"
            >
              Login
            </button>
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading text-3xl">
              UPLOAD <span className="text-yellow">ITEM</span>
            </h1>
            <p className="text-muted text-sm">Logged in as {user}</p>
          </div>
          <button
            onClick={() => {
              setUser('');
              setPin('');
            }}
            className="flex items-center gap-1 text-sm text-muted hover:text-black transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-6">
            {success}
            <button
              onClick={() => setSuccess('')}
              className="float-right font-bold"
            >
              &times;
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo upload */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              Photos
            </label>
            <div className="flex flex-wrap gap-3">
              {imageUrls.map((url, i) => (
                <div
                  key={i}
                  className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200"
                >
                  <img
                    src={url}
                    alt={`Upload ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setImageUrls((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-muted hover:border-yellow hover:text-yellow transition-colors"
              >
                {uploading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Camera size={20} />
                    <span className="text-[10px] mt-1">Add</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Gemini AI button */}
          {imageUrls.length > 0 && (
            <button
              type="button"
              onClick={handleGeminiAI}
              disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 rounded-xl hover:bg-dark transition-colors disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Sparkles size={18} />
              )}
              {aiLoading ? 'Analyzing with AI...' : 'Auto-fill with Gemini AI'}
            </button>
          )}

          {/* Form fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold mb-1">
                Item Name *
              </label>
              <input
                type="text"
                value={form.item_name}
                onChange={(e) =>
                  setForm({ ...form, item_name: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Brand</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Price (AED) *
              </label>
              <input
                type="number"
                step="0.01"
                value={form.sale_price}
                onChange={(e) =>
                  setForm({ ...form, sale_price: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.slug} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Shop</label>
              <select
                value={form.shop_source}
                onChange={(e) =>
                  setForm({ ...form, shop_source: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
              >
                {SHOPS.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Barcode
              </label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) =>
                  setForm({ ...form, barcode: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Product Type
              </label>
              <input
                type="text"
                value={form.product_type}
                onChange={(e) =>
                  setForm({ ...form, product_type: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold mb-1">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow resize-none"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 bg-yellow text-black font-semibold py-3 rounded-xl hover:bg-yellow/90 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Upload size={18} />
            )}
            Submit for Review
          </button>
        </form>
      </div>
    </div>
  );
}
