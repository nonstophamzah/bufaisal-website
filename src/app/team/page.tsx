'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Upload, Sparkles, Loader2, LogOut, Camera, ArrowLeft, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';

const SHOP_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Brand New'] as const;
const PHOTO_LABELS = ['Item Photo', 'Barcode Label', 'Extra (optional)'];

type Step = 'shop' | 'password' | 'name' | 'upload';

export default function TeamPage() {
  // --- navigation state ---
  const [step, setStep] = useState<Step>('shop');
  const [shopLabel, setShopLabel] = useState('');
  const [managerName, setManagerName] = useState('');
  const [nameInput, setNameInput] = useState('');

  // --- password state ---
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Load saved name from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('bufaisal_worker_name');
    if (saved) setNameInput(saved);
  }, []);

  // --- upload state ---
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const fileInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const [form, setForm] = useState({
    item_name: '',
    brand: '',
    description: '',
    category: CATEGORIES[0].name,
    condition: 'Good' as string,
    barcode: '',
    product_type: '',
    condition_notes: '',
    seo_title: '',
    seo_description: '',
  });

  // --- STEP 2: password validation (server-side, never exposes hashes) ---
  const handlePasswordSubmit = async () => {
    setPasswordLoading(true);
    setPasswordError(false);

    try {
      const res = await fetch('/api/shop-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_label: shopLabel, password }),
      });

      if (res.ok) {
        setStep('name');
        setPassword('');
      } else {
        setPasswordError(true);
      }
    } catch {
      setPasswordError(true);
    }
    setPasswordLoading(false);
  };

  const handleNameSubmit = () => {
    const name = nameInput.trim();
    if (!name) return;
    localStorage.setItem('bufaisal_worker_name', name);
    setManagerName(name);
    setStep('upload');
  };

  // --- Cloudinary upload (kept from original) ---
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slotIndex: number
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError('');
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('upload_preset', 'bufaisal_unsigned');

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (data.secure_url) {
        setImageUrls((prev) => {
          const updated = [...prev];
          updated[slotIndex] = data.secure_url;
          return updated;
        });
      }
    } catch {
      setError('Failed to upload image');
    }

    setUploading(false);
    // reset the input so the same file can be re-selected
    e.target.value = '';
  };

  // --- Helper: compress image to max 800px, JPEG quality 0.7 ---
  const compressImage = (url: string): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round(height * (MAX / width));
            width = MAX;
          } else {
            width = Math.round(width * (MAX / height));
            height = MAX;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const b64 = dataUrl.split(',')[1];
        if (b64) resolve({ base64: b64, mimeType: 'image/jpeg' });
        else reject(new Error('Compression failed'));
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = url;
    });

  // --- Gemini AI: scan item photo + barcode label photo ---
  const handleGeminiAI = async () => {
    const itemPhotoUrl = imageUrls[0];
    const barcodePhotoUrl = imageUrls[1];

    if (!itemPhotoUrl && !barcodePhotoUrl) {
      setError('Upload at least the Item Photo or Barcode Label first');
      return;
    }

    setAiLoading(true);
    setError('');

    try {
      // Scan item photo for name/brand/category/condition
      let itemResult: Record<string, string> = {};
      if (itemPhotoUrl) {
        const img = await compressImage(itemPhotoUrl);
        const res = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
          body: JSON.stringify({
            imageBase64: img.base64,
            mimeType: img.mimeType,
          }),
        });
        const data = await res.json();
        if (res.ok && data.text) {
          const match = data.text.match(/\{[\s\S]*\}/);
          if (match) itemResult = JSON.parse(match[0]);
        }
      }

      // Scan barcode label for barcode number + brand
      let barcodeResult: Record<string, string> = {};
      if (barcodePhotoUrl) {
        const img = await compressImage(barcodePhotoUrl);
        const res = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET_KEY || '' },
          body: JSON.stringify({
            imageBase64: img.base64,
            mimeType: img.mimeType,
            prompt: `Read the barcode label in this image. Extract any barcode number, item name, brand name, or model number visible on the label.
Return a JSON object with these fields:
- barcode: the barcode number/text (string of digits or alphanumeric code)
- item_name: product name if visible
- brand: brand name if visible
Return ONLY the JSON object, no other text.`,
          }),
        });
        const data = await res.json();
        if (res.ok && data.text) {
          const match = data.text.match(/\{[\s\S]*\}/);
          if (match) barcodeResult = JSON.parse(match[0]);
        }
      }

      // Merge results: barcode scan fills barcode; item scan fills everything else
      setForm((prev) => ({
        ...prev,
        item_name: itemResult.item_name || barcodeResult.item_name || prev.item_name,
        brand: itemResult.brand || barcodeResult.brand || prev.brand,
        description: itemResult.description || prev.description,
        category: itemResult.category || prev.category,
        condition: itemResult.condition || prev.condition,
        barcode: barcodeResult.barcode || prev.barcode,
        seo_title: itemResult.seo_title || prev.seo_title,
        seo_description: itemResult.seo_description || prev.seo_description,
      }));

      if (!itemResult.item_name && !barcodeResult.barcode) {
        setError('AI could not read the photos clearly. Try clearer images.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`AI scan failed: ${msg}`);
    }

    setAiLoading(false);
  };

  // --- Submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item_name) {
      setError('Item name is required');
      return;
    }

    const urls = imageUrls.filter((u) => !!u);
    if (urls.length === 0) {
      setError('Upload at least one photo');
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
      condition: form.condition,
      sale_price: 0,
      shop_source: `Shop ${shopLabel}`,
      shop_label: shopLabel,
      duty_manager: managerName,
      barcode: form.barcode || null,
      image_urls: urls,
      thumbnail_url: urls[0] || null,
      uploaded_by: managerName,
      is_published: false,
      is_sold: false,
      condition_notes: form.condition_notes || null,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
    });

    if (dbError) {
      setError(dbError.message);
    } else {
      setSuccess(true);
    }

    setUploading(false);
  };

  const resetForm = () => {
    setForm({
      item_name: '',
      brand: '',
      description: '',
      category: CATEGORIES[0].name,
      condition: 'Good',
      barcode: '',
      product_type: '',
      condition_notes: '',
      seo_title: '',
      seo_description: '',
    });
    setImageUrls([]);
    setSuccess(false);
    setError('');
  };

  const handleLogout = () => {
    setStep('shop');
    setShopLabel('');
    setManagerName('');
    setPassword('');
    setPasswordError(false);
    resetForm();
  };

  // =========================================================
  // STEP 1 — SHOP SELECTOR
  // =========================================================
  if (step === 'shop') {
    return (
      <div className="min-h-screen bg-black flex flex-col pt-20 px-4 pb-8">
        <h1 className="font-heading text-4xl text-white text-center mt-6 mb-8">
          SELECT <span className="text-yellow">SHOP</span>
        </h1>
        <div className="flex flex-col gap-4 max-w-lg mx-auto w-full flex-1 justify-center">
          {SHOP_LABELS.map((label) => (
            <button
              key={label}
              onClick={() => {
                setShopLabel(label);
                setStep('password');
              }}
              className="w-full bg-yellow text-black rounded-2xl py-8 text-center active:scale-95 transition-transform"
            >
              <span className="font-heading text-5xl">SHOP {label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // =========================================================
  // STEP 2 — PASSWORD
  // =========================================================
  if (step === 'password') {
    return (
      <div className="min-h-screen bg-black flex flex-col pt-20 px-4 pb-8">
        <button
          onClick={() => {
            setStep('shop');
            setPassword('');
            setPasswordError(false);
          }}
          className="text-white flex items-center gap-2 mt-4 mb-6 text-lg"
        >
          <ArrowLeft size={24} />
          <span className="font-heading text-2xl">BACK</span>
        </button>

        <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
          <h1 className="font-heading text-5xl text-yellow mb-10 text-center">
            SHOP {shopLabel}
          </h1>

          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            placeholder="Enter password"
            className={`w-full text-center text-2xl px-6 py-5 rounded-2xl border-2 focus:outline-none bg-white text-black ${
              passwordError
                ? 'border-red-500 animate-[shake_0.3s_ease-in-out]'
                : 'border-yellow focus:border-yellow'
            }`}
            autoFocus
          />

          {passwordError && (
            <p className="text-red-400 text-xl font-bold mt-4">
              Wrong password
            </p>
          )}

          <button
            onClick={handlePasswordSubmit}
            disabled={passwordLoading || !password}
            className="w-full bg-yellow text-black font-heading text-3xl py-5 rounded-2xl mt-6 active:scale-95 transition-transform disabled:opacity-50"
          >
            {passwordLoading ? (
              <Loader2 size={28} className="animate-spin mx-auto" />
            ) : (
              'ENTER'
            )}
          </button>
        </div>
      </div>
    );
  }

  // =========================================================
  // STEP 3 — YOUR NAME
  // =========================================================
  if (step === 'name') {
    return (
      <div className="min-h-screen bg-black flex flex-col pt-20 px-4 pb-8">
        <button
          onClick={() => setStep('password')}
          className="text-white flex items-center gap-2 mt-4 mb-6 text-lg"
        >
          <ArrowLeft size={24} />
          <span className="font-heading text-2xl">BACK</span>
        </button>

        <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
          <h1 className="font-heading text-5xl text-yellow mb-4 text-center">
            SHOP {shopLabel}
          </h1>
          <p className="font-heading text-3xl text-white text-center mb-10">
            YOUR NAME
          </p>

          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            placeholder="Enter your name"
            className="w-full text-center text-2xl px-6 py-5 rounded-2xl border-2 border-yellow focus:outline-none bg-white text-black"
            autoFocus
          />

          <button
            onClick={handleNameSubmit}
            disabled={!nameInput.trim()}
            className="w-full bg-yellow text-black font-heading text-3xl py-5 rounded-2xl mt-6 active:scale-95 transition-transform disabled:opacity-50"
          >
            CONTINUE
          </button>
        </div>
      </div>
    );
  }

  // =========================================================
  // SUCCESS SCREEN
  // =========================================================
  if (success) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6">
          <Check size={44} className="text-white" />
        </div>
        <h1 className="font-heading text-4xl text-white text-center mb-2">
          UPLOADED!
        </h1>
        <p className="text-gray-400 text-lg text-center mb-10">
          Item sent for admin approval
        </p>
        <button
          onClick={resetForm}
          className="w-full max-w-sm bg-yellow text-black font-heading text-3xl py-5 rounded-2xl active:scale-95 transition-transform"
        >
          UPLOAD ANOTHER
        </button>
        <button
          onClick={handleLogout}
          className="mt-4 text-gray-500 text-lg"
        >
          Switch Shop
        </button>
      </div>
    );
  }

  // =========================================================
  // STEP 4 — UPLOAD FORM
  // =========================================================
  return (
    <div className="pt-20 pb-16 bg-white min-h-screen">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 mt-2">
          <div>
            <h1 className="font-heading text-3xl">
              SHOP {shopLabel} <span className="text-yellow">&bull;</span>{' '}
              <span className="text-yellow">{managerName.toUpperCase()}</span>
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-gray-100 px-4 py-2 rounded-xl text-base font-medium"
          >
            <LogOut size={18} />
            Exit
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo upload — 3 labeled slots */}
          <div>
            <p className="font-heading text-xl mb-3">PHOTOS</p>
            <div className="grid grid-cols-3 gap-3">
              {PHOTO_LABELS.map((label, i) => (
                <div key={label}>
                  <p className="text-sm font-semibold text-center mb-1.5">
                    {label}
                  </p>
                  {imageUrls[i] ? (
                    <div className="relative aspect-square rounded-xl overflow-hidden border-2 border-yellow">
                      <Image
                        src={imageUrls[i]}
                        alt={label}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 30vw, 200px"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setImageUrls((prev) => {
                            const updated = [...prev];
                            updated[i] = '';
                            return updated;
                          })
                        }
                        className="absolute top-1.5 right-1.5 w-8 h-8 bg-red-500 text-white rounded-full text-lg flex items-center justify-center font-bold"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRefs[i]?.current?.click()}
                      disabled={uploading}
                      className="w-full aspect-square border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 active:border-yellow active:text-yellow transition-colors"
                    >
                      {uploading ? (
                        <Loader2 size={28} className="animate-spin" />
                      ) : (
                        <>
                          <Camera size={28} />
                          <span className="text-xs mt-1 font-medium">TAP</span>
                        </>
                      )}
                    </button>
                  )}
                  <input
                    ref={fileInputRefs[i]}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, i)}
                    className="hidden"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Gemini AI button */}
          {imageUrls.some((u) => !!u) && (
            <button
              type="button"
              onClick={handleGeminiAI}
              disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 bg-black text-white font-heading text-2xl py-4 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <Sparkles size={22} />
              )}
              {aiLoading ? 'SCANNING...' : 'AI SCAN'}
            </button>
          )}

          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-base font-bold mb-1">
                Item Name *
              </label>
              <input
                type="text"
                value={form.item_name}
                onChange={(e) =>
                  setForm({ ...form, item_name: e.target.value })
                }
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
                required
              />
            </div>

            <div>
              <label className="block text-base font-bold mb-1">Brand</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
              />
            </div>

            <div>
              <label className="block text-base font-bold mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow bg-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.slug} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-base font-bold mb-1">
                Condition
              </label>
              <select
                value={form.condition}
                onChange={(e) =>
                  setForm({ ...form, condition: e.target.value })
                }
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow bg-white"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-base font-bold mb-1">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow resize-none"
              />
            </div>

            <div>
              <label className="block text-base font-bold mb-1">
                Condition Notes <span className="text-gray-400 font-normal">(e.g. &quot;small scratch on side&quot;)</span>
              </label>
              <textarea
                value={form.condition_notes}
                onChange={(e) =>
                  setForm({ ...form, condition_notes: e.target.value })
                }
                rows={2}
                placeholder="Any scratches, marks, missing parts..."
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow resize-none"
              />
            </div>

            <div>
              <label className="block text-base font-bold mb-1">
                Barcode <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) =>
                  setForm({ ...form, barcode: e.target.value })
                }
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
              />
            </div>

            <div>
              <label className="block text-base font-bold mb-1">
                Product Type{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.product_type}
                onChange={(e) =>
                  setForm({ ...form, product_type: e.target.value })
                }
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
              />
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-base font-bold text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 bg-yellow text-black font-heading text-3xl py-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={26} className="animate-spin" />
            ) : (
              <Upload size={26} />
            )}
            SUBMIT
          </button>
        </form>
      </div>
    </div>
  );
}
