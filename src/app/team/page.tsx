'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Upload, Sparkles, Loader2, LogOut, Camera, ArrowLeft, Check, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';
import imageCompression from 'browser-image-compression';
import { CATEGORIES } from '@/lib/constants';

const SHOP_TOKEN_KEY = 'bufaisal_shop_token';

const SHOP_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Brand New'] as const;
const PHOTO_LABELS = ['Item Photo', 'Barcode Label', 'Extra (optional)'];
const MIN_PHOTOS = 3;

type Step = 'shop' | 'password' | 'name' | 'upload';

// PR #13: small pill that lives next to the PHOTOS heading. Tells the
// worker how many photos they've uploaded out of the required minimum.
function PhotoCount({ count }: { count: number }) {
  if (count >= MIN_PHOTOS) {
    return (
      <span className="text-sm font-bold text-green-600">
        Photos uploaded: {count} ✓
      </span>
    );
  }
  const need = MIN_PHOTOS - count;
  return (
    <span className="text-sm font-medium text-gray-500">
      Photos uploaded: {count} of {MIN_PHOTOS}
      <span className="text-gray-400"> (need {need} more)</span>
    </span>
  );
}

// PR #13: motivational box at the top of the upload step. Pulls today's
// upload count for this worker at this shop, plus a soft progress bar
// against a 20/day goal.
function WorkerHistory({
  shopLabel,
  workerName,
  todayCount,
  goal,
}: {
  shopLabel: string;
  workerName: string;
  todayCount: number | null;
  goal: number;
}) {
  const pct = todayCount === null ? 0 : Math.min(100, Math.round((todayCount / goal) * 100));
  return (
    <div className="bg-yellow/10 border border-yellow/40 rounded-xl px-4 py-3 mb-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">
          <span className="font-bold">Today: </span>
          {todayCount === null ? (
            <span className="text-gray-500">…</span>
          ) : (
            <span className="font-heading text-lg">{todayCount}</span>
          )}
          <span className="text-gray-600"> items uploaded</span>
        </p>
        <p className="text-xs text-gray-500">Goal: {goal}/day</p>
      </div>
      <div className="mt-2 h-1.5 w-full bg-yellow/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-yellow rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-1.5">
        {workerName} @ Shop {shopLabel}
      </p>
    </div>
  );
}

export default function TeamPage() {
  const router = useRouter();
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

  // PR #13: fetch today's upload count whenever a named worker reaches
  // the upload step. Re-runs after a successful submit (success flips
  // back to false in resetForm but the worker stays on 'upload').
  const fetchTodayCount = async () => {
    const token = sessionStorage.getItem(SHOP_TOKEN_KEY);
    if (!token || !managerName) return;
    try {
      const res = await fetch('/api/team/stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ worker_name: managerName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.today_count === 'number') {
          setTodayCount(data.today_count);
        }
      }
    } catch {
      // Silent fail — counter is motivational, not essential.
    }
  };

  useEffect(() => {
    if (step === 'upload' && managerName) {
      fetchTodayCount();
    }
    // managerName change is the only trigger that matters; fetchTodayCount
    // closes over current state at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, managerName]);

  // --- upload state ---
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
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
    // PR #13: empty default forces the worker to make an explicit pick.
    // The "-- Choose category --" option keeps the submit button gated.
    category: '',
    condition: 'Good' as string,
    barcode: '',
    product_type: '',
    condition_notes: '',
    seo_title: '',
    seo_description: '',
    sale_price: '',
    // PR #12: default ON. Worker flips to OFF only when price is at the
    // floor (item shows a "Starting Price" pill instead of "Negotiable").
    negotiable: true,
    // Empty default forces the worker to tap Used or New before AI Scan
    // and SUBMIT unlock. Server rejects inserts where this is missing.
    listing_type: '' as '' | 'used' | 'new',
  });

  // PR #13: today-counter for the worker. Fetched on entering the upload
  // step and refreshed after a successful submission.
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const DAILY_GOAL = 20;

  // Architecture Section 2.2: real prices required.
  const priceNum = Number(form.sale_price);
  const priceValid =
    form.sale_price.trim() !== '' && !isNaN(priceNum) && priceNum >= 1;

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

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        sessionStorage.setItem(SHOP_TOKEN_KEY, data.token);
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

  // --- Cloudinary upload ---
  //
  // IMPORTANT (Decisions Log v1.1 Addendum, decision 6):
  // Cloudinary photos are PERMANENT. Once uploaded they must never be
  // auto-deleted by any client- or server-side code path. Photos persist
  // through admin reject, item un-publish, and listing regeneration so the
  // history of every worker upload remains auditable. If you ever need to
  // remove a photo, do it manually from the Cloudinary dashboard with
  // explicit human approval — do not script it.
  //
  // Phase 2 (this commit): compress on-device before the Cloudinary POST.
  // Target ~400KB per photo at max 1600px on the long edge, JPEG out.
  // browser-image-compression runs the work in a Web Worker so the UI
  // stays responsive on phones. The original device file is never sent.
  // If compression itself fails, we fall back to uploading the raw file
  // rather than blocking the worker — a heavier upload is better than a
  // dropped intake.
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slotIndex: number
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError('');
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    let payload: Blob = files[0];
    try {
      payload = await imageCompression(files[0], {
        maxSizeMB: 0.4,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: 'image/jpeg',
      });
    } catch {
      // Compression failed (rare — corrupt file or browser without worker
      // support). Fall back to the raw file so the worker still gets the
      // upload through; Cloudinary will accept either way.
      payload = files[0];
    }

    const formData = new FormData();
    formData.append('file', payload);
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

  // Helper: compress image to max 1200px, JPEG quality 0.85.
  // Sprint 3 / Fix 3: bumped from 800px / 0.7 so daylight photos retain
  // enough detail for Gemini to read brand/model labels.
  const compressImage = (url: string): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const MAX = 1200;
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const b64 = dataUrl.split(',')[1];
        if (b64) resolve({ base64: b64, mimeType: 'image/jpeg' });
        else reject(new Error('Compression failed'));
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = url;
    });

  // Gemini AI: send all uploaded photos + form context for item_analysis,
  // run a separate barcode_scan on the barcode label slot if present.
  // Sprint 3 / Fix 3: AI now only returns title + description.
  // Brand / category / condition stay as the worker entered them.
  const handleGeminiAI = async () => {
    const allPhotos = imageUrls.filter((u) => !!u);
    const barcodePhotoUrl = imageUrls[1];

    if (allPhotos.length === 0) {
      setError('Upload at least one photo first');
      return;
    }

    if (!form.listing_type) {
      setError('Tap Used or New before scanning');
      return;
    }

    setAiLoading(true);
    setError('');

    try {
      // Compress all uploaded photos in parallel for the listing-prompt call.
      const compressed = await Promise.all(allPhotos.map((u) => compressImage(u)));

      const listingReq = fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'item_analysis',
          images: compressed,
          context: {
            brand: form.brand,
            category: form.category,
            condition: form.condition,
            condition_notes: form.condition_notes,
            listing_type: form.listing_type,
            shop: shopLabel ? `Shop ${shopLabel}, Ajman` : 'Ajman',
            price: form.sale_price ? Number(form.sale_price) : null,
          },
        }),
      });

      // Run barcode_scan in parallel if the barcode label slot is filled.
      const barcodeReq = barcodePhotoUrl
        ? compressImage(barcodePhotoUrl).then((img) =>
            fetch('/api/gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'barcode_scan',
                imageBase64: img.base64,
                mimeType: img.mimeType,
              }),
            })
          )
        : null;

      const [listingRes, barcodeRes] = await Promise.all([
        listingReq,
        barcodeReq ?? Promise.resolve(null),
      ]);

      let listingResult: { title?: string; description?: string } = {};
      if (listingRes.ok) {
        const data = await listingRes.json();
        if (data.text) {
          const match = data.text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              listingResult = JSON.parse(match[0]);
            } catch {
              /* ignore JSON parse error — fall through to error message below */
            }
          }
        }
      }

      let barcodeResult: { barcode?: string } = {};
      if (barcodeRes && barcodeRes.ok) {
        const data = await barcodeRes.json();
        if (data.text) {
          const match = data.text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              barcodeResult = JSON.parse(match[0]);
            } catch {
              /* ignore */
            }
          }
        }
      }

      // Apply ONLY title + description (and optionally barcode).
      // Worker-entered brand/category/condition are NOT overwritten.
      setForm((prev) => ({
        ...prev,
        item_name: listingResult.title || prev.item_name,
        description: listingResult.description || prev.description,
        seo_title: listingResult.title || prev.seo_title,
        seo_description: listingResult.description || prev.seo_description,
        barcode: barcodeResult.barcode || prev.barcode,
      }));

      // Loosened validation: only error if BOTH title and description are
      // missing. Workers can still submit manually — AI failure is non-blocking.
      if (!listingResult.title && !listingResult.description) {
        setError(
          'AI could not generate a listing from the photos. Fill the title and description manually and tap SUBMIT.'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`AI scan failed: ${msg}. You can still fill the form manually and submit.`);
    }

    setAiLoading(false);
  };

  // --- Submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // PR #13: item_name is no longer required client-side. Empty title
    // is filled by the async AI job. Category is still required so the
    // listing can be routed while the AI runs.
    if (!form.category) {
      setError('Choose a category');
      return;
    }

    if (!form.listing_type) {
      setError('Tap Used or New');
      return;
    }

    const price = Number(form.sale_price);
    if (!form.sale_price || isNaN(price) || price <= 0) {
      setError('Price is required and must be greater than 0');
      return;
    }

    const urls = imageUrls.filter((u) => !!u);
    if (urls.length === 0) {
      setError('Upload at least one photo');
      return;
    }

    setError('');
    setUploading(true);

    const token = sessionStorage.getItem(SHOP_TOKEN_KEY);
    if (!token) {
      setError('Session expired. Please sign in again.');
      setUploading(false);
      handleLogout();
      return;
    }

    try {
      const res = await fetch('/api/team/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'insert_item',
          item: {
            item_name: form.item_name,
            brand: form.brand || null,
            product_type: form.product_type || null,
            description: form.description || null,
            category: form.category,
            condition: form.condition,
            sale_price: price,
            shop_source: `Shop ${shopLabel}`,
            shop_label: shopLabel,
            duty_manager: managerName,
            barcode: form.barcode || null,
            image_urls: urls,
            thumbnail_url: urls[0] || null,
            uploaded_by: managerName,
            condition_notes: form.condition_notes || null,
            seo_title: form.seo_title || null,
            seo_description: form.seo_description || null,
            negotiable: form.negotiable,
            listing_type: form.listing_type,
          },
        }),
      });

      if (res.status === 401) {
        sessionStorage.removeItem(SHOP_TOKEN_KEY);
        setError('Session expired. Please sign in again.');
        setUploading(false);
        handleLogout();
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Upload failed');
      } else {
        setSuccess(true);
        // PR #13: refresh counter so the next form sees the new total.
        fetchTodayCount();
      }
    } catch {
      setError('Network error — please try again');
    }

    setUploading(false);
  };

  const resetForm = () => {
    setForm({
      item_name: '',
      brand: '',
      description: '',
      category: '',
      condition: 'Good',
      barcode: '',
      product_type: '',
      condition_notes: '',
      seo_title: '',
      seo_description: '',
      sale_price: '',
      negotiable: true,
      listing_type: '',
    });
    setImageUrls([]);
    setSuccess(false);
    setError('');
    setPriceTouched(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SHOP_TOKEN_KEY);
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
      <div className="relative min-h-screen bg-black flex flex-col pt-20 px-4 pb-8">
        {/* Home chip */}
        <button
          onClick={() => router.push('/')}
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold active:scale-95 min-h-[40px]"
        >
          <Home size={14} /> HOME
        </button>
        <div className="text-center">
          <span className="font-heading text-yellow text-xl tracking-widest">BU FAISAL</span>
        </div>
        <h1 className="font-heading text-4xl text-white text-center mt-4 mb-8">
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
      <div className="relative min-h-screen bg-black flex flex-col pt-20 px-4 pb-8">
        {/* Home chip */}
        <button
          onClick={() => router.push('/')}
          className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold active:scale-95 min-h-[40px]"
        >
          <Home size={14} /> HOME
        </button>
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
          <span className="font-heading text-yellow text-lg tracking-widest mb-4">BU FAISAL</span>
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
      <div className="relative min-h-screen bg-black flex flex-col pt-20 px-4 pb-8">
        {/* Home chip */}
        <button
          onClick={() => router.push('/')}
          className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold active:scale-95 min-h-[40px]"
        >
          <Home size={14} /> HOME
        </button>
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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-center">
        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6">
          <Check size={44} className="text-white" />
        </div>
        <h1 className="font-heading text-4xl text-white mb-3">SUBMITTED!</h1>
        <p className="text-gray-300 text-lg max-w-md mb-2">
          AI is preparing the listing.
        </p>
        <p className="text-gray-500 text-base max-w-md mb-10">
          Admin will review shortly. You can upload another item now.
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

        <WorkerHistory
          shopLabel={shopLabel}
          workerName={managerName}
          todayCount={todayCount}
          goal={DAILY_GOAL}
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo upload — 3 labeled slots */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="font-heading text-xl">PHOTOS</p>
              <PhotoCount count={imageUrls.filter((u) => !!u).length} />
            </div>
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

          {/* Used / New picker — must be tapped before AI Scan unlocks. */}
          {imageUrls.some((u) => !!u) && (
            <div>
              <p className="font-heading text-xl mb-3">USED OR NEW?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, listing_type: 'used' })}
                  className={`py-5 rounded-2xl font-heading text-3xl border-2 active:scale-95 transition-transform ${
                    form.listing_type === 'used'
                      ? 'bg-yellow text-black border-yellow'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                  aria-pressed={form.listing_type === 'used'}
                >
                  USED
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, listing_type: 'new' })}
                  className={`py-5 rounded-2xl font-heading text-3xl border-2 active:scale-95 transition-transform ${
                    form.listing_type === 'new'
                      ? 'bg-yellow text-black border-yellow'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                  aria-pressed={form.listing_type === 'new'}
                >
                  NEW
                </button>
              </div>
              {!form.listing_type && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Tap one to unlock AI Scan
                </p>
              )}
            </div>
          )}

          {/* Gemini AI button */}
          {imageUrls.some((u) => !!u) && (
            <button
              type="button"
              onClick={handleGeminiAI}
              disabled={aiLoading || !form.listing_type}
              className="w-full flex items-center justify-center gap-2 bg-black text-white font-heading text-2xl py-4 rounded-xl active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
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
                Item Name
              </label>
              <input
                type="text"
                value={form.item_name}
                onChange={(e) =>
                  setForm({ ...form, item_name: e.target.value })
                }
                placeholder="Leave blank — AI will generate from photos"
                className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow placeholder:text-gray-400"
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
                Price (AED) *
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={form.sale_price}
                onChange={(e) =>
                  setForm({ ...form, sale_price: e.target.value })
                }
                onBlur={() => setPriceTouched(true)}
                placeholder="e.g. 250"
                className={`w-full px-4 py-3.5 text-lg border-2 rounded-xl focus:outline-none ${
                  priceTouched && !priceValid
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-200 focus:border-yellow'
                }`}
                required
                aria-invalid={priceTouched && !priceValid}
                aria-describedby="price-help"
              />
              {priceTouched && !priceValid && (
                <p id="price-help" className="text-red-500 text-sm font-bold mt-1.5">
                  Price is required (must be at least 1 AED)
                </p>
              )}
            </div>

            {/* PR #12: Negotiable toggle. Default ON. */}
            <div>
              <button
                type="button"
                role="switch"
                aria-checked={form.negotiable}
                aria-label="Price is negotiable"
                onClick={() => setForm({ ...form, negotiable: !form.negotiable })}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border-2 transition-colors ${
                  form.negotiable
                    ? 'bg-yellow/10 border-yellow'
                    : 'bg-gray-100 border-gray-300'
                }`}
              >
                <span className="text-left">
                  <span className="block font-bold text-base">Price is negotiable</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Off = customer sees &quot;Starting Price&quot; instead
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${
                    form.negotiable ? 'bg-yellow' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      form.negotiable ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </span>
              </button>
            </div>

            <div>
              <label className="block text-base font-bold mb-1">
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
                className={`w-full px-4 py-3.5 text-lg border-2 rounded-xl focus:outline-none focus:border-yellow bg-white ${
                  form.category ? 'border-gray-200 text-black' : 'border-gray-200 text-gray-400'
                }`}
                required
              >
                <option value="" disabled>
                  -- Choose category --
                </option>
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
                inputMode="numeric"
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
            disabled={uploading || !priceValid || !form.category || !form.listing_type}
            className="w-full flex items-center justify-center gap-2 bg-yellow text-black font-heading text-3xl py-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
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
