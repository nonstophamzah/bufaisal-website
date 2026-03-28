'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Upload, Sparkles, Loader2, LogOut, Camera, ArrowLeft, Check } from 'lucide-react';
import { supabase, DutyManager } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';

const SHOP_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
const CONDITIONS = ['Excellent', 'Good', 'Fair'] as const;
const PHOTO_LABELS = ['Front', 'Side', 'Inside / Back'];

type Step = 'shop' | 'password' | 'manager' | 'upload';

export default function TeamPage() {
  // --- navigation state ---
  const [step, setStep] = useState<Step>('shop');
  const [shopLabel, setShopLabel] = useState('');
  const [managerName, setManagerName] = useState('');

  // --- password state ---
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // --- manager state ---
  const [managers, setManagers] = useState<DutyManager[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);

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
    seo_title: '',
    seo_description: '',
  });

  // --- STEP 2: password validation ---
  const handlePasswordSubmit = async () => {
    setPasswordLoading(true);
    setPasswordError(false);

    const { data } = await supabase
      .from('shop_passwords')
      .select('*')
      .eq('shop_label', shopLabel)
      .eq('password', password)
      .maybeSingle();

    if (data) {
      setStep('manager');
      setPassword('');
    } else {
      setPasswordError(true);
    }
    setPasswordLoading(false);
  };

  // --- STEP 3: fetch managers ---
  const fetchManagers = useCallback(async () => {
    setManagersLoading(true);
    const { data } = await supabase
      .from('duty_managers')
      .select('*')
      .eq('shop_label', shopLabel)
      .eq('is_active', true)
      .order('name');
    setManagers(data || []);
    setManagersLoading(false);
  }, [shopLabel]);

  useEffect(() => {
    if (step === 'manager' && shopLabel) {
      fetchManagers();
    }
  }, [step, shopLabel, fetchManagers]);

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

  // --- Gemini AI (kept from original, updated prompt) ---
  const handleGeminiAI = async () => {
    const firstImage = imageUrls.find((u) => !!u);
    if (!firstImage) {
      setError('Upload a photo first');
      return;
    }

    setAiLoading(true);
    setError('');

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        setError('Gemini API key is not configured.');
        setAiLoading(false);
        return;
      }

      // Fetch image as base64
      const imgRes = await fetch(firstImage);
      if (!imgRes.ok) {
        setError(`Failed to load image for AI scan (${imgRes.status})`);
        setAiLoading(false);
        return;
      }
      const blob = await imgRes.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const b64 = result.split(',')[1];
          if (b64) resolve(b64);
          else reject(new Error('Failed to convert image to base64'));
        };
        reader.onerror = () => reject(new Error('FileReader error'));
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
                    text: `Analyze this image of a used item for sale in a second-hand store. Return a JSON object with these fields:
- item_name: a clear, concise name for this item
- brand: the brand if visible, or "Unknown"
- description: a short 1-2 sentence description of the item's condition and features
- category: one of these exact values: "Living Room", "Bedroom", "Dining and Kitchen", "Appliances", "Decor and Furnishing", "Clothing", "Specialty Items"
- condition: one of these exact values: "Excellent", "Good", "Fair"
- seo_title: a short SEO-friendly title for this product listing (under 60 characters)
- seo_description: a 1-2 sentence SEO meta description for this listing

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

      // Check for API-level errors
      if (!res.ok || data.error) {
        const msg = data.error?.message || `Gemini API error (${res.status})`;
        setError(`AI error: ${msg}`);
        setAiLoading(false);
        return;
      }

      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!text) {
        setError('AI returned empty response. Try a clearer photo.');
        setAiLoading(false);
        return;
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setForm((prev) => ({
          ...prev,
          item_name: parsed.item_name || prev.item_name,
          brand: parsed.brand || prev.brand,
          description: parsed.description || prev.description,
          category: parsed.category || prev.category,
          condition: parsed.condition || prev.condition,
          seo_title: parsed.seo_title || prev.seo_title,
          seo_description: parsed.seo_description || prev.seo_description,
        }));
      } else {
        setError('AI response could not be parsed. Try again.');
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
    setShowOtherInput(false);
    setOtherName('');
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
  // STEP 3 — DUTY MANAGER
  // =========================================================
  if (step === 'manager') {
    return (
      <div className="min-h-screen bg-black flex flex-col pt-20 px-4 pb-8">
        <button
          onClick={() => {
            setStep('password');
            setShowOtherInput(false);
            setOtherName('');
          }}
          className="text-white flex items-center gap-2 mt-4 mb-6 text-lg"
        >
          <ArrowLeft size={24} />
          <span className="font-heading text-2xl">BACK</span>
        </button>

        <h1 className="font-heading text-3xl text-white text-center mb-2">
          SHOP {shopLabel}
        </h1>
        <p className="font-heading text-4xl text-yellow text-center mb-8">
          WHO IS ON DUTY?
        </p>

        <div className="flex flex-col gap-4 max-w-lg mx-auto w-full flex-1">
          {managersLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 size={40} className="animate-spin text-yellow" />
            </div>
          ) : (
            <>
              {managers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setManagerName(m.name);
                    setStep('upload');
                  }}
                  className="w-full bg-yellow text-black rounded-2xl py-7 text-center active:scale-95 transition-transform"
                >
                  <span className="font-heading text-4xl">{m.name.toUpperCase()}</span>
                </button>
              ))}

              {/* Other option */}
              {!showOtherInput ? (
                <button
                  onClick={() => setShowOtherInput(true)}
                  className="w-full border-2 border-yellow text-yellow rounded-2xl py-7 text-center active:scale-95 transition-transform"
                >
                  <span className="font-heading text-4xl">OTHER</span>
                </button>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={otherName}
                    onChange={(e) => setOtherName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && otherName.trim()) {
                        setManagerName(otherName.trim());
                        setStep('upload');
                      }
                    }}
                    placeholder="Type your name"
                    className="w-full text-center text-2xl px-6 py-5 rounded-2xl border-2 border-yellow focus:outline-none bg-white text-black"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (otherName.trim()) {
                        setManagerName(otherName.trim());
                        setStep('upload');
                      }
                    }}
                    disabled={!otherName.trim()}
                    className="w-full bg-yellow text-black font-heading text-3xl py-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
                  >
                    CONTINUE
                  </button>
                </div>
              )}
            </>
          )}
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
                    capture="environment"
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
