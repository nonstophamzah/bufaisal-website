'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Loader2, LogOut, Camera, ArrowLeft, Check, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';
import imageCompression from 'browser-image-compression';

const SHOP_TOKEN_KEY = 'bufaisal_shop_token';
const DRAFT_KEY = 'bufaisal-upload-draft';
// Drafts older than this are dropped silently — anything from a previous
// shift is almost certainly stale work the worker has already moved past.
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
const DAILY_GOAL = 20;

const SHOP_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

type Step = 'shop' | 'password' | 'name' | 'upload';
type ConditionType = 'Used' | 'New' | '';
type ConditionGrade = 'Excellent' | 'Good' | 'Fair' | '';
type Negotiable = 'Yes' | 'No' | '';
type PhotoSlot = 'brand' | 'photo_2' | 'photo_3' | 'barcode';

interface PhotoState {
  brand: string;
  photo_2: string;
  photo_3: string;
  barcode: string;
}

interface DraftState {
  worker_id: string;
  photos: PhotoState;
  condition_type: ConditionType;
  condition_grade: ConditionGrade;
  negotiable: Negotiable;
  price_aed: string;
  note: string;
  saved_at: number;
}

const EMPTY_PHOTOS: PhotoState = {
  brand: '',
  photo_2: '',
  photo_3: '',
  barcode: '',
};

// Motivational header showing today's upload count vs the daily goal.
// Counter is fetched from /api/team/stats (DB count for the worker today)
// rather than localStorage so it survives clearing browser data and
// matches what admin sees server-side.
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

  // --- form state (Phase 3 pill design) ---
  const [photos, setPhotos] = useState<PhotoState>(EMPTY_PHOTOS);
  const [conditionType, setConditionType] = useState<ConditionType>('');
  const [conditionGrade, setConditionGrade] = useState<ConditionGrade>('');
  const [negotiable, setNegotiable] = useState<Negotiable>('');
  const [priceAed, setPriceAed] = useState('');
  const [note, setNote] = useState('');

  // --- ui state ---
  const [uploadingSlot, setUploadingSlot] = useState<PhotoSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftState | null>(null);
  const draftHydratedRef = useRef(false);

  const fileInputRefs = {
    brand: useRef<HTMLInputElement>(null),
    photo_2: useRef<HTMLInputElement>(null),
    photo_3: useRef<HTMLInputElement>(null),
    barcode: useRef<HTMLInputElement>(null),
  };

  // Restore worker name from a previous session.
  useEffect(() => {
    const saved = localStorage.getItem('bufaisal_worker_name');
    if (saved) setNameInput(saved);
  }, []);

  // Today-counter fetch — runs on entering the upload step and after submit.
  const fetchTodayCount = useCallback(async () => {
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
  }, [managerName]);

  useEffect(() => {
    if (step === 'upload' && managerName) {
      fetchTodayCount();
    }
  }, [step, managerName, fetchTodayCount]);

  // Draft hydration on entering upload step. Runs once per session per worker
  // so re-entering upload after a successful submit doesn't re-prompt.
  useEffect(() => {
    if (step !== 'upload' || draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as DraftState;
      if (
        !draft ||
        draft.worker_id !== managerName ||
        Date.now() - draft.saved_at > DRAFT_MAX_AGE_MS
      ) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      const hasContent =
        draft.photos.brand ||
        draft.photos.photo_2 ||
        draft.photos.photo_3 ||
        draft.photos.barcode ||
        draft.condition_type ||
        draft.price_aed ||
        draft.note;
      if (!hasContent) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      setPendingDraft(draft);
      setShowResume(true);
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [step, managerName]);

  // Draft autosave on every meaningful field change. Skipped while the
  // resume prompt is up so we don't overwrite the saved draft with the
  // empty form before the worker decides.
  useEffect(() => {
    if (step !== 'upload' || !managerName || showResume) return;
    const draft: DraftState = {
      worker_id: managerName,
      photos,
      condition_type: conditionType,
      condition_grade: conditionGrade,
      negotiable,
      price_aed: priceAed,
      note,
      saved_at: Date.now(),
    };
    const hasContent =
      photos.brand ||
      photos.photo_2 ||
      photos.photo_3 ||
      photos.barcode ||
      conditionType ||
      priceAed ||
      note;
    if (hasContent) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Quota exceeded or storage disabled — nothing actionable.
      }
    }
  }, [step, managerName, photos, conditionType, conditionGrade, negotiable, priceAed, note, showResume]);

  // --- shop password ---
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

  // --- Photo upload ---
  //
  // IMPORTANT (Decisions Log v1.1 Addendum, decision 6):
  // Cloudinary photos are PERMANENT. Once uploaded they must never be
  // auto-deleted by any client- or server-side code path. Photos persist
  // through admin reject, item un-publish, and listing regeneration so the
  // history of every worker upload remains auditable. If you ever need to
  // remove a photo, do it manually from the Cloudinary dashboard with
  // explicit human approval — do not script it.
  //
  // Phase 2: compress on-device before the Cloudinary POST. Target ~400KB
  // per photo at max 1600px on the long edge, JPEG out. The Web Worker
  // path keeps the UI responsive; libURL points at the self-hosted copy in
  // /public so the worker can importScripts() it from same-origin (CSP
  // allows worker-src 'self' blob: only). Without this, iPhone Safari falls
  // back to main-thread compression and freezes the UI for 10–25s.
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: PhotoSlot
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingSlot(slot);
    setError('');
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    let payload: Blob = files[0];
    try {
      payload = await imageCompression(files[0], {
        maxSizeMB: 0.4,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: 'image/jpeg',
        libURL: '/browser-image-compression.js',
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
        setPhotos((prev) => ({ ...prev, [slot]: data.secure_url }));
      } else {
        setError('Failed to upload image');
      }
    } catch {
      setError('Failed to upload image');
    }

    setUploadingSlot(null);
    e.target.value = '';
  };

  const clearPhoto = (slot: PhotoSlot) => {
    setPhotos((prev) => ({ ...prev, [slot]: '' }));
  };

  // --- Submit ---
  const priceNum = Number(priceAed);
  const priceValid = priceAed.trim() !== '' && Number.isInteger(priceNum) && priceNum >= 1;

  const allPhotosUploaded =
    !!photos.brand && !!photos.photo_2 && !!photos.photo_3 && !!photos.barcode;
  const conditionValid =
    conditionType === 'New' ||
    (conditionType === 'Used' && conditionGrade !== '');
  const submitEnabled =
    allPhotosUploaded && conditionValid && negotiable !== '' && priceValid && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitEnabled) return;

    setError('');
    setSubmitting(true);
    setSubmitProgress(0);

    // Smooth progress fill 0→100% over ~1.5s. The actual network call runs
    // in parallel; we wait on whichever finishes last so the worker sees a
    // complete bar before the green tick.
    const PROGRESS_DURATION_MS = 1500;
    const PROGRESS_STEPS = 30;
    const progressPromise = new Promise<void>((resolve) => {
      let i = 0;
      const tick = setInterval(() => {
        i += 1;
        setSubmitProgress(Math.round((i / PROGRESS_STEPS) * 100));
        if (i >= PROGRESS_STEPS) {
          clearInterval(tick);
          resolve();
        }
      }, PROGRESS_DURATION_MS / PROGRESS_STEPS);
    });

    const token = sessionStorage.getItem(SHOP_TOKEN_KEY);
    if (!token) {
      setError('Session expired. Please sign in again.');
      setSubmitting(false);
      handleLogout();
      return;
    }

    // Map shop letter (A–E) to the BF1–BF5 worker_shop_id used by the
    // SEO Agent prompt. Decisions Log v1.1 names BF1–BF5 explicitly.
    const shopIndex = SHOP_LABELS.indexOf(shopLabel as (typeof SHOP_LABELS)[number]);
    const workerShopId = shopIndex >= 0 ? `BF${shopIndex + 1}` : shopLabel;

    const apiPromise = fetch('/api/team/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'insert_item',
        item: {
          worker_id: managerName,
          worker_shop_id: workerShopId,
          worker_condition_type: conditionType,
          worker_condition_grade: conditionType === 'Used' ? conditionGrade : null,
          worker_negotiable: negotiable === 'Yes',
          worker_price_aed: priceNum,
          worker_note: note.trim() || null,
          worker_photo_brand_url: photos.brand,
          worker_photo_2_url: photos.photo_2,
          worker_photo_3_url: photos.photo_3,
          worker_photo_barcode_url: photos.barcode,
        },
      }),
    });

    let res: Response;
    try {
      [, res] = await Promise.all([progressPromise, apiPromise]);
    } catch {
      setError('Network error — please try again');
      setSubmitting(false);
      setSubmitProgress(0);
      return;
    }

    if (res.status === 401) {
      sessionStorage.removeItem(SHOP_TOKEN_KEY);
      setError('Session expired. Please sign in again.');
      setSubmitting(false);
      setSubmitProgress(0);
      handleLogout();
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Upload failed');
      setSubmitting(false);
      setSubmitProgress(0);
      return;
    }

    // Success — clear draft, show green tick, then auto-redirect.
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setSuccess(true);
    fetchTodayCount();
    window.setTimeout(() => {
      resetForm();
    }, 1100);
  };

  const resetForm = () => {
    setPhotos(EMPTY_PHOTOS);
    setConditionType('');
    setConditionGrade('');
    setNegotiable('');
    setPriceAed('');
    setNote('');
    setSuccess(false);
    setError('');
    setSubmitting(false);
    setSubmitProgress(0);
    setPendingDraft(null);
    setShowResume(false);
    // Allow the resume prompt to fire again next time the page mounts.
    draftHydratedRef.current = true;
  };

  const handleResume = () => {
    if (!pendingDraft) return;
    setPhotos(pendingDraft.photos);
    setConditionType(pendingDraft.condition_type);
    setConditionGrade(pendingDraft.condition_grade);
    setNegotiable(pendingDraft.negotiable);
    setPriceAed(pendingDraft.price_aed);
    setNote(pendingDraft.note);
    setPendingDraft(null);
    setShowResume(false);
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setPendingDraft(null);
    setShowResume(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SHOP_TOKEN_KEY);
    setStep('shop');
    setShopLabel('');
    setManagerName('');
    setPassword('');
    setPasswordError(false);
    resetForm();
    draftHydratedRef.current = false;
  };

  // =========================================================
  // STEP 1 — SHOP SELECTOR
  // =========================================================
  if (step === 'shop') {
    return (
      <div className="relative min-h-screen bg-black flex flex-col pt-20 px-4 pb-8">
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
  // SUCCESS SCREEN — shown briefly between submit and reset.
  // =========================================================
  if (success) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-center">
        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 animate-[scaleIn_0.3s_ease-out]">
          <Check size={44} className="text-white" />
        </div>
        <h1 className="font-heading text-4xl text-white mb-2">Item uploaded ✓</h1>
        <p className="text-gray-400 text-base">Loading next item...</p>
      </div>
    );
  }

  // =========================================================
  // STEP 4 — UPLOAD FORM (Phase 3 pill design)
  // =========================================================
  return (
    <div className="pt-20 pb-16 bg-white min-h-screen">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 mt-2">
          <h1 className="font-heading text-3xl">
            SHOP {shopLabel} <span className="text-yellow">&bull;</span>{' '}
            <span className="text-yellow">{managerName.toUpperCase()}</span>
          </h1>
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

        {/* Resume-draft prompt */}
        {showResume && pendingDraft && (
          <div className="bg-yellow/10 border-2 border-yellow rounded-xl p-4 mb-5">
            <p className="font-bold text-base mb-3">Resume previous upload?</p>
            <p className="text-sm text-gray-600 mb-3">
              You have an unfinished upload from earlier. Resume it or start fresh?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleResume}
                className="py-3 rounded-xl bg-yellow text-black font-heading text-lg active:scale-95"
              >
                RESUME
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="py-3 rounded-xl bg-white border-2 border-gray-300 text-gray-700 font-heading text-lg active:scale-95"
              >
                DISCARD
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ITEM PHOTOS — 3 slots, slot 1 = Brand */}
          <div>
            <p className="font-heading text-xl mb-3">ITEM PHOTOS (3 required)</p>
            <div className="grid grid-cols-3 gap-3">
              <PhotoSlotCard
                slot="brand"
                label="Brand"
                helper="Shoot the brand plate or logo. For furniture without a brand, take a clean angle of the item."
                url={photos.brand}
                uploading={uploadingSlot === 'brand'}
                inputRef={fileInputRefs.brand}
                onUpload={handleImageUpload}
                onClear={clearPhoto}
              />
              <PhotoSlotCard
                slot="photo_2"
                label="Photo 2"
                url={photos.photo_2}
                uploading={uploadingSlot === 'photo_2'}
                inputRef={fileInputRefs.photo_2}
                onUpload={handleImageUpload}
                onClear={clearPhoto}
              />
              <PhotoSlotCard
                slot="photo_3"
                label="Photo 3"
                url={photos.photo_3}
                uploading={uploadingSlot === 'photo_3'}
                inputRef={fileInputRefs.photo_3}
                onUpload={handleImageUpload}
                onClear={clearPhoto}
              />
            </div>
          </div>

          {/* BARCODE LABEL PHOTO — visually distinct zone */}
          <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4">
            <p className="font-heading text-xl mb-1 text-blue-900">
              BARCODE LABEL PHOTO (required)
            </p>
            <p className="text-xs text-blue-700 mb-3">
              The Bufaisal sticker (e.g. BFW26031208).
            </p>
            <div className="grid grid-cols-3 gap-3">
              <PhotoSlotCard
                slot="barcode"
                label="Barcode"
                url={photos.barcode}
                uploading={uploadingSlot === 'barcode'}
                inputRef={fileInputRefs.barcode}
                onUpload={handleImageUpload}
                onClear={clearPhoto}
                accent="blue"
              />
            </div>
          </div>

          {/* USED OR NEW pills (reused from PR #18 picker) */}
          <div>
            <p className="font-heading text-xl mb-3">USED OR NEW?</p>
            <div className="grid grid-cols-2 gap-3">
              <PillButton
                active={conditionType === 'Used'}
                onClick={() => setConditionType('Used')}
                size="lg"
              >
                USED
              </PillButton>
              <PillButton
                active={conditionType === 'New'}
                onClick={() => {
                  setConditionType('New');
                  setConditionGrade('');
                }}
                size="lg"
              >
                NEW
              </PillButton>
            </div>
          </div>

          {/* CONDITION pills — only when Used */}
          {conditionType === 'Used' && (
            <div>
              <p className="font-heading text-xl mb-3">CONDITION</p>
              <div className="grid grid-cols-3 gap-3">
                <PillButton
                  active={conditionGrade === 'Excellent'}
                  onClick={() => setConditionGrade('Excellent')}
                >
                  EXCELLENT
                </PillButton>
                <PillButton
                  active={conditionGrade === 'Good'}
                  onClick={() => setConditionGrade('Good')}
                >
                  GOOD
                </PillButton>
                <PillButton
                  active={conditionGrade === 'Fair'}
                  onClick={() => setConditionGrade('Fair')}
                >
                  FAIR
                </PillButton>
              </div>
            </div>
          )}

          {/* NEGOTIABLE pills */}
          <div>
            <p className="font-heading text-xl mb-3">NEGOTIABLE?</p>
            <div className="grid grid-cols-2 gap-3">
              <PillButton
                active={negotiable === 'Yes'}
                onClick={() => setNegotiable('Yes')}
              >
                YES
              </PillButton>
              <PillButton
                active={negotiable === 'No'}
                onClick={() => setNegotiable('No')}
              >
                NO
              </PillButton>
            </div>
          </div>

          {/* PRICE */}
          <div>
            <label className="block font-heading text-xl mb-2">PRICE (AED)</label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={priceAed}
              onChange={(e) => setPriceAed(e.target.value)}
              placeholder="e.g. 250"
              className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow"
            />
          </div>

          {/* NOTE */}
          <div>
            <label className="block font-heading text-xl mb-2">NOTE (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Anything to flag — repair history, where it came from, special details"
              className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-yellow resize-none"
            />
          </div>

          {error && (
            <p className="text-red-500 text-base font-bold text-center">
              {error}
            </p>
          )}

          {/* Progress bar (visible during submit) */}
          {submitting && (
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow transition-all"
                style={{ width: `${submitProgress}%` }}
              />
            </div>
          )}

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={!submitEnabled}
            className={`w-full flex items-center justify-center gap-2 font-heading text-3xl py-5 rounded-2xl active:scale-95 transition-transform ${
              submitEnabled
                ? 'bg-yellow text-black'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <Loader2 size={26} className="animate-spin" />
            ) : (
              'SUBMIT'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------

function PillButton({
  active,
  onClick,
  size = 'md',
  children,
}: {
  active: boolean;
  onClick: () => void;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}) {
  const sizeClass = size === 'lg' ? 'py-5 text-3xl' : 'py-4 text-xl';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${sizeClass} rounded-2xl font-heading border-2 active:scale-95 transition-transform ${
        active
          ? 'bg-yellow text-black border-yellow'
          : 'bg-white text-gray-700 border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

function PhotoSlotCard({
  slot,
  label,
  helper,
  url,
  uploading,
  inputRef,
  onUpload,
  onClear,
  accent,
}: {
  slot: PhotoSlot;
  label: string;
  helper?: string;
  url: string;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, slot: PhotoSlot) => void;
  onClear: (slot: PhotoSlot) => void;
  accent?: 'blue';
}) {
  const filledBorder = accent === 'blue' ? 'border-blue-500' : 'border-yellow';
  const emptyBorder = accent === 'blue' ? 'border-blue-300' : 'border-gray-300';
  const tapColor = accent === 'blue' ? 'active:border-blue-600 active:text-blue-600' : 'active:border-yellow active:text-yellow';
  return (
    <div>
      <p className="text-sm font-semibold text-center mb-1.5">{label}</p>
      {url ? (
        <div className={`relative aspect-square rounded-xl overflow-hidden border-2 ${filledBorder}`}>
          <Image
            src={url}
            alt={label}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 30vw, 200px"
          />
          <button
            type="button"
            onClick={() => onClear(slot)}
            className="absolute top-1.5 right-1.5 w-8 h-8 bg-red-500 text-white rounded-full text-lg flex items-center justify-center font-bold"
          >
            &times;
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`w-full aspect-square border-2 border-dashed ${emptyBorder} rounded-xl flex flex-col items-center justify-center text-gray-400 ${tapColor} transition-colors`}
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
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => onUpload(e, slot)}
        className="hidden"
      />
      {helper && (
        <p className="text-[11px] text-gray-500 mt-1.5 leading-tight">{helper}</p>
      )}
    </div>
  );
}
