'use client';

// Diesel Tracker — 3-screen submit flow (4 photos)
// 1. CAPTURE: tap 4 tiles (plate / license / odo / pump), each opens camera,
//             captures, compresses, uploads to Cloudinary, AND analyzes via Gemini
// 2. REVIEW : shows OCR'd fields in editable UI + truck/driver dropdown with auto-match
// 3. RESULT : confirmation + flag badge if flagged

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Camera as CameraIcon,
  AlertTriangle,
  Fuel,
  RotateCcw,
} from 'lucide-react';
import { uploadToCloudinary } from '../../appliances/lib/upload';
import {
  listTrucks,
  listDrivers,
  resolvePlate,
  resolveDriver,
  submitFill,
  callGemini,
  type TruckRow,
  type DriverRow,
  type PlateResult,
  type OdoResult,
  type PumpResult,
  type LicenseResult,
  type ComputedResult,
} from '@/lib/diesel-api';

const SESSION_KEY = 'diesel_pin_ok';

type Screen = 'capture' | 'review' | 'result';
type Slot = 'plate' | 'license' | 'odo' | 'pump';

type SlotState = {
  previewUrl: string | null;     // local object URL for preview
  cloudinaryUrl: string | null;  // final uploaded URL (persisted)
  ocrLoading: boolean;
  ocrError: string | null;
  ocrResult: PlateResult | LicenseResult | OdoResult | PumpResult | null;
  confidence: number | null;
  raw: unknown;
};

const emptySlot = (): SlotState => ({
  previewUrl: null,
  cloudinaryUrl: null,
  ocrLoading: false,
  ocrError: null,
  ocrResult: null,
  confidence: null,
  raw: null,
});

// ---- helpers ----
function compressToBlobAndBase64(
  file: File,
  maxW = 800,
  quality = 0.7
): Promise<{ blob: Blob; base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxW) {
        h = (h * maxW) / w;
        w = maxW;
      }
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('No canvas'));
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Compress failed'));
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const b64 = dataUrl.split(',')[1];
            if (!b64) return reject(new Error('Base64 failed'));
            resolve({ blob, base64: b64, mime: 'image/jpeg' });
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Load failed'));
    img.src = URL.createObjectURL(file);
  });
}

export default function DieselSubmitPage() {
  const router = useRouter();

  // ----- gate -----
  const [gated, setGated] = useState(true);
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) !== '1') {
      router.replace('/diesel');
      return;
    }
    setGated(false);
  }, [router]);

  // ----- screen state -----
  const [screen, setScreen] = useState<Screen>('capture');

  // ----- per-photo slots -----
  const [plate, setPlate]     = useState<SlotState>(emptySlot());
  const [license, setLicense] = useState<SlotState>(emptySlot());
  const [odo, setOdo]         = useState<SlotState>(emptySlot());
  const [pump, setPump]       = useState<SlotState>(emptySlot());
  const slotSetter = (slot: Slot) =>
    slot === 'plate' ? setPlate
    : slot === 'license' ? setLicense
    : slot === 'odo' ? setOdo
    : setPump;
  const slotState = (slot: Slot) =>
    slot === 'plate' ? plate
    : slot === 'license' ? license
    : slot === 'odo' ? odo
    : pump;

  // ----- active capture slot -----
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----- trucks + drivers for dropdown fallback -----
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  useEffect(() => {
    listTrucks().then(setTrucks).catch(() => setTrucks([]));
    listDrivers().then(setDrivers).catch(() => setDrivers([]));
  }, []);

  // ----- review screen state -----
  const [selectedTruckId, setSelectedTruckId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [odometerKm, setOdometerKm] = useState<string>('');
  const [litersFilled, setLitersFilled] = useState<string>('');
  const [plateAutoMatchedTruckId, setPlateAutoMatchedTruckId] = useState<string | null>(null);
  const [driverAutoMatchedId, setDriverAutoMatchedId] = useState<string | null>(null);
  const [driverWillAutoCreate, setDriverWillAutoCreate] = useState<boolean>(false);
  const [plateWillAutoCreate, setPlateWillAutoCreate] = useState<boolean>(false);
  const [autoFillOdo, setAutoFillOdo] = useState<number | null>(null);
  const [autoFillLiters, setAutoFillLiters] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');

  // ----- result screen state -----
  const [result, setResult] = useState<null | {
    confirmation: string;
    computed: ComputedResult;
    reviewHints: { truckNeedsReview: boolean; driverNeedsReview: boolean };
  }>(null);

  // --------------------------------------------------
  // Capture + analyze flow per slot
  // --------------------------------------------------
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slot = activeSlot;
    e.target.value = '';
    if (!file || !slot) return;
    if (file.size > 15 * 1024 * 1024) {
      slotSetter(slot)({ ...slotState(slot), ocrError: 'File too large (max 15MB)' });
      return;
    }

    const setSlot = slotSetter(slot);
    setSlot({
      ...emptySlot(),
      previewUrl: URL.createObjectURL(file),
      ocrLoading: true,
    });

    try {
      const { blob, base64, mime } = await compressToBlobAndBase64(file);

      // upload + OCR in parallel
      const geminiPromise =
        slot === 'plate'   ? callGemini<PlateResult>('diesel_plate', base64, mime)
        : slot === 'license' ? callGemini<LicenseResult>('diesel_license', base64, mime)
        : slot === 'odo'   ? callGemini<OdoResult>('diesel_odometer', base64, mime)
        : callGemini<PumpResult>('diesel_pump', base64, mime);

      const [cloudinaryUrl, ocrRaw] = await Promise.all([
        uploadToCloudinary(blob),
        geminiPromise,
      ]);

      setSlot({
        previewUrl: URL.createObjectURL(file),
        cloudinaryUrl,
        ocrLoading: false,
        ocrError: null,
        ocrResult: ocrRaw,
        confidence: ocrRaw.confidence ?? null,
        raw: (ocrRaw as { _raw?: unknown })._raw,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Capture failed';
      setSlot({ ...emptySlot(), ocrError: msg });
    } finally {
      setActiveSlot(null);
    }
  };

  const openCapture = (slot: Slot) => {
    setActiveSlot(slot);
    // small delay so activeSlot state is set before the input opens
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const allCaptured =
    !!plate.cloudinaryUrl &&
    !!license.cloudinaryUrl &&
    !!odo.cloudinaryUrl &&
    !!pump.cloudinaryUrl &&
    !plate.ocrLoading &&
    !license.ocrLoading &&
    !odo.ocrLoading &&
    !pump.ocrLoading;

  // --------------------------------------------------
  // Move to review: resolve plate + driver, prefill form
  // --------------------------------------------------
  const goToReview = async () => {
    if (!allCaptured) return;

    const plateOcr   = plate.ocrResult   as PlateResult   | null;
    const licenseOcr = license.ocrResult as LicenseResult | null;
    const odoOcr     = odo.ocrResult     as OdoResult     | null;
    const pumpOcr    = pump.ocrResult    as PumpResult    | null;

    // Resolve truck from plate OCR (no auto-create in resolver — that happens on submit)
    let matchedTruckId: string | null = null;
    if (plateOcr?.plate_number) {
      try {
        const res = await resolvePlate(plateOcr.plate_number);
        if (res.truck) matchedTruckId = res.truck.id;
      } catch { /* ignore */ }
    }
    if (!matchedTruckId && plateOcr?.plate_digits) {
      try {
        const res = await resolvePlate(plateOcr.plate_digits);
        if (res.truck) matchedTruckId = res.truck.id;
      } catch { /* ignore */ }
    }
    setPlateAutoMatchedTruckId(matchedTruckId);
    setSelectedTruckId(matchedTruckId || '');
    setPlateWillAutoCreate(!matchedTruckId && !!(plateOcr?.plate_number || plateOcr?.plate_digits));

    // Resolve driver from license OCR
    let matchedDriverId: string | null = null;
    if (licenseOcr?.full_name || licenseOcr?.license_number) {
      try {
        const res = await resolveDriver({
          name: licenseOcr.full_name,
          license_number: licenseOcr.license_number,
        });
        if (res.driver) matchedDriverId = res.driver.id;
      } catch { /* ignore */ }
    }
    setDriverAutoMatchedId(matchedDriverId);
    setSelectedDriverId(matchedDriverId || '');
    setDriverWillAutoCreate(!matchedDriverId && !!(licenseOcr?.full_name || licenseOcr?.license_number));

    const odoVal = odoOcr?.odometer_km ?? null;
    const litVal = pumpOcr?.liters ?? null;
    setAutoFillOdo(odoVal);
    setAutoFillLiters(litVal);
    setOdometerKm(odoVal !== null ? String(odoVal) : '');
    setLitersFilled(litVal !== null ? String(litVal) : '');

    setScreen('review');
  };

  // --------------------------------------------------
  // Submit
  // --------------------------------------------------
  const doSubmit = async () => {
    setSubmitError('');
    const plateOcr   = plate.ocrResult   as PlateResult   | null;
    const licenseOcr = license.ocrResult as LicenseResult | null;

    // At least plate OR truck_id must resolve
    if (!selectedTruckId && !plateOcr?.plate_number) {
      setSubmitError('Cannot identify truck — retake plate photo or pick manually.');
      return;
    }
    const odoNum = parseFloat(odometerKm);
    const litNum = parseFloat(litersFilled);
    if (!Number.isFinite(odoNum) || odoNum < 0) {
      setSubmitError('Check odometer reading');
      return;
    }
    if (!Number.isFinite(litNum) || litNum <= 0 || litNum >= 2000) {
      setSubmitError('Check liters');
      return;
    }

    const correctedByHuman =
      selectedTruckId !== plateAutoMatchedTruckId ||
      selectedDriverId !== driverAutoMatchedId ||
      odoNum !== autoFillOdo ||
      litNum !== autoFillLiters;

    setSubmitting(true);
    try {
      const res = await submitFill({
        // truck identification: prefer selected dropdown, fall back to plate OCR for auto-create
        truck_id: selectedTruckId || undefined,
        plate_raw: selectedTruckId ? undefined : (plateOcr?.plate_number || plateOcr?.plate_digits || undefined),
        plate_display: selectedTruckId ? undefined : (plateOcr?.plate_number || undefined),

        // driver identification
        driver_id: selectedDriverId || undefined,
        driver_name: selectedDriverId ? undefined : (licenseOcr?.full_name || undefined),
        driver_license_number: selectedDriverId ? undefined : (licenseOcr?.license_number || undefined),

        odometer_km: odoNum,
        liters_filled: litNum,

        photo_plate_url: plate.cloudinaryUrl!,
        photo_license_url: license.cloudinaryUrl,
        photo_odometer_url: odo.cloudinaryUrl!,
        photo_pump_url: pump.cloudinaryUrl!,

        submitted_via: 'web_form',
        corrected_by_human: correctedByHuman,
        gemini_confidence_plate: plate.confidence,
        gemini_confidence_odo: odo.confidence,
        gemini_confidence_pump: pump.confidence,
        gemini_confidence_license: license.confidence,
        gemini_raw: {
          plate: plate.raw,
          license: license.raw,
          odo: odo.raw,
          pump: pump.raw,
        },
      });
      setResult({
        confirmation: res.confirmation,
        computed: res.computed,
        reviewHints: {
          truckNeedsReview: !!res.truck.needs_review,
          driverNeedsReview: !!res.driver?.needs_review,
        },
      });
      setScreen('result');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setPlate(emptySlot());
    setLicense(emptySlot());
    setOdo(emptySlot());
    setPump(emptySlot());
    setSelectedTruckId('');
    setSelectedDriverId('');
    setOdometerKm('');
    setLitersFilled('');
    setResult(null);
    setScreen('capture');
  };

  if (gated) return null;

  // ===================================================
  // Screen: RESULT
  // ===================================================
  if (screen === 'result' && result) {
    const flagged = result.computed.flagged;
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
            flagged ? 'bg-red-500' : 'bg-green-500'
          }`}
        >
          {flagged ? <AlertTriangle size={40} /> : <Check size={48} strokeWidth={3} />}
        </div>
        <h2 className="font-heading text-3xl mb-2">{flagged ? 'FLAGGED' : 'LOGGED'}</h2>
        <p className="text-center text-lg mb-6 max-w-sm">{result.confirmation}</p>

        {(result.reviewHints.truckNeedsReview || result.reviewHints.driverNeedsReview) && (
          <div className="w-full max-w-sm bg-blue-500/10 border border-blue-500/40 rounded-xl p-4 mb-4 text-sm">
            <p className="font-bold text-blue-300 mb-1">New record created</p>
            <ul className="list-disc pl-5 text-gray-300">
              {result.reviewHints.truckNeedsReview && <li>New truck — manager will verify plate.</li>}
              {result.reviewHints.driverNeedsReview && <li>New driver — manager will verify identity.</li>}
            </ul>
          </div>
        )}

        {result.computed.anomalies.length > 0 && (
          <div className="w-full max-w-sm bg-yellow/10 border border-yellow/30 rounded-xl p-4 mb-4 text-sm">
            <p className="font-bold text-yellow mb-1">Notes:</p>
            <ul className="list-disc pl-5 text-gray-300">
              {result.computed.anomalies.map((a) => (
                <li key={a}>{a.replace(/_/g, ' ')}</li>
              ))}
            </ul>
          </div>
        )}

        {result.computed.cost_aed !== null && (
          <p className="text-xs text-gray-500 mb-4">
            Cost recorded: <span className="text-white font-semibold">{result.computed.cost_aed} AED</span>
            {result.computed.price_per_liter ? ` @ ${result.computed.price_per_liter}/L` : ''}
          </p>
        )}

        <div className="flex gap-3 w-full max-w-sm mt-4">
          <button
            onClick={() => router.push('/diesel')}
            className="flex-1 py-4 rounded-2xl bg-gray-800 text-white font-bold text-lg"
          >
            Done
          </button>
          <button
            onClick={resetAll}
            className="flex-1 py-4 rounded-2xl bg-yellow text-black font-heading text-xl"
          >
            LOG NEXT
          </button>
        </div>
      </div>
    );
  }

  // ===================================================
  // Screen: REVIEW
  // ===================================================
  if (screen === 'review') {
    const licenseOcr = license.ocrResult as LicenseResult | null;
    const plateOcr   = plate.ocrResult   as PlateResult   | null;
    return (
      <div className="min-h-screen bg-black text-white px-4 pt-4 pb-24">
        <button
          onClick={() => setScreen('capture')}
          className="flex items-center gap-1 text-gray-500 mb-4 min-h-[48px]"
        >
          <ArrowLeft size={20} /> Back
        </button>

        <h1 className="font-heading text-3xl mb-1">REVIEW</h1>
        <p className="text-sm text-gray-400 mb-4">
          Check the numbers. Correct anything wrong before submitting.
        </p>

        {/* Photo thumbnails */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {(['plate', 'license', 'odo', 'pump'] as Slot[]).map((s) => {
            const st = slotState(s);
            return (
              <div key={s} className="aspect-square rounded-xl overflow-hidden bg-gray-900">
                {st.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={st.previewUrl} alt={s} className="w-full h-full object-cover" />
                )}
              </div>
            );
          })}
        </div>

        {/* Truck */}
        <label className="block text-xs text-gray-400 mb-1">TRUCK</label>
        {plateAutoMatchedTruckId && (
          <p className="text-xs text-green-400 mb-1">
            ✓ Auto-matched from plate photo. Change if wrong.
          </p>
        )}
        {!plateAutoMatchedTruckId && plateWillAutoCreate && (
          <p className="text-xs text-blue-300 mb-1">
            New plate &quot;{plateOcr?.plate_number || plateOcr?.plate_digits}&quot; — will be added on submit. Manager will confirm.
          </p>
        )}
        {!plateAutoMatchedTruckId && !plateWillAutoCreate && plate.ocrResult && (
          <p className="text-xs text-yellow mb-1">
            Plate OCR unclear — pick truck manually.
          </p>
        )}
        <select
          value={selectedTruckId}
          onChange={(e) => setSelectedTruckId(e.target.value)}
          className="w-full py-4 px-3 rounded-xl bg-gray-900 text-white border border-gray-700 mb-4"
        >
          <option value="">{plateWillAutoCreate ? '-- auto-create from photo --' : '-- select truck --'}</option>
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.plate_display} {t.nickname ? `(${t.nickname})` : ''}
            </option>
          ))}
        </select>

        {/* Driver */}
        <label className="block text-xs text-gray-400 mb-1">DRIVER</label>
        {driverAutoMatchedId && (
          <p className="text-xs text-green-400 mb-1">
            ✓ Auto-matched from licence photo. Change if wrong.
          </p>
        )}
        {!driverAutoMatchedId && driverWillAutoCreate && (
          <p className="text-xs text-blue-300 mb-1">
            New driver &quot;{licenseOcr?.full_name || licenseOcr?.license_number}&quot; — will be added on submit. Manager will confirm.
          </p>
        )}
        {!driverAutoMatchedId && !driverWillAutoCreate && (
          <p className="text-xs text-yellow mb-1">
            Licence OCR failed — pick driver manually (or skip).
          </p>
        )}
        <select
          value={selectedDriverId}
          onChange={(e) => setSelectedDriverId(e.target.value)}
          className="w-full py-4 px-3 rounded-xl bg-gray-900 text-white border border-gray-700 mb-4"
        >
          <option value="">{driverWillAutoCreate ? '-- auto-create from licence --' : '-- no driver --'}</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name} {d.nickname ? `(${d.nickname})` : ''}
            </option>
          ))}
        </select>

        {/* Odometer */}
        <label className="block text-xs text-gray-400 mb-1">ODOMETER (KM)</label>
        <input
          type="number"
          inputMode="decimal"
          value={odometerKm}
          onChange={(e) => setOdometerKm(e.target.value)}
          className="w-full py-4 px-3 rounded-xl bg-gray-900 text-white border border-gray-700 mb-4 text-lg"
          placeholder="e.g. 142560"
        />

        {/* Liters */}
        <label className="block text-xs text-gray-400 mb-1">LITERS FILLED</label>
        <input
          type="number"
          inputMode="decimal"
          value={litersFilled}
          onChange={(e) => setLitersFilled(e.target.value)}
          className="w-full py-4 px-3 rounded-xl bg-gray-900 text-white border border-gray-700 mb-6 text-lg"
          placeholder="e.g. 45.20"
        />

        {submitError && (
          <p className="text-red-400 text-sm text-center mb-3">{submitError}</p>
        )}

        <button
          onClick={doSubmit}
          disabled={submitting || !odometerKm || !litersFilled}
          className="w-full py-5 rounded-2xl bg-green-500 text-white font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Check size={24} strokeWidth={3} />
          )}
          SUBMIT FILL
        </button>
      </div>
    );
  }

  // ===================================================
  // Screen: CAPTURE (default)
  // ===================================================
  const Tile = ({ slot, label }: { slot: Slot; label: string }) => {
    const st = slotState(slot);
    return (
      <button
        onClick={() => openCapture(slot)}
        className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-900 border-2 border-gray-800 active:scale-95 transition-transform"
      >
        {st.previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={st.previewUrl} alt={label} className="w-full h-full object-cover" />
            {st.ocrLoading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-yellow" />
              </div>
            )}
            {!st.ocrLoading && st.cloudinaryUrl && (
              <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                <Check size={14} strokeWidth={4} className="text-white" />
              </div>
            )}
            {st.ocrError && (
              <div className="absolute bottom-0 inset-x-0 bg-red-600/90 text-white text-xs p-1 text-center">
                {st.ocrError}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
            <CameraIcon size={28} className="mb-2" />
            <span className="font-bold text-xs uppercase">{label}</span>
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 pt-4 pb-8">
      <button
        onClick={() => {
          sessionStorage.removeItem(SESSION_KEY);
          router.push('/diesel');
        }}
        className="flex items-center gap-1 text-gray-500 mb-4 min-h-[48px]"
      >
        <ArrowLeft size={20} /> Exit
      </button>

      <div className="flex items-center gap-2 mb-2">
        <Fuel size={24} className="text-yellow" />
        <h1 className="font-heading text-3xl">LOG FILL</h1>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Tap each tile. Take a clear photo. We&apos;ll read the numbers for you.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Tile slot="plate"   label="Plate" />
        <Tile slot="license" label="Licence" />
        <Tile slot="odo"     label="Odometer" />
        <Tile slot="pump"    label="Pump" />
      </div>

      {/* retake option */}
      {(plate.previewUrl || license.previewUrl || odo.previewUrl || pump.previewUrl) && (
        <button
          onClick={() => {
            setPlate(emptySlot());
            setLicense(emptySlot());
            setOdo(emptySlot());
            setPump(emptySlot());
          }}
          className="flex items-center gap-2 text-gray-500 mb-4 text-sm"
        >
          <RotateCcw size={14} /> Clear all & retake
        </button>
      )}

      <button
        onClick={goToReview}
        disabled={!allCaptured}
        className="w-full py-5 rounded-2xl bg-yellow text-black font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30"
      >
        {allCaptured ? (
          <>
            <ArrowRight size={24} />
            REVIEW
          </>
        ) : (
          'TAKE ALL 4 PHOTOS'
        )}
      </button>

      {/* Hidden file input reused per slot */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />
    </div>
  );
}
