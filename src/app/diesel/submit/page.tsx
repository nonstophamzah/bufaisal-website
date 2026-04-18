'use client';

// Diesel Tracker — PIN gate + 4-photo submit flow
//
// Screens:
//   gate    — PIN entry (diesel guy)
//   capture — 4 tiles (plate / licence / odo / pump), each opens camera
//   review  — editable OCR'd values + truck/driver dropdowns
//   result  — confirmation + flags

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
  LayoutDashboard,
} from 'lucide-react';
import Link from 'next/link';
import { uploadToCloudinary } from '../../appliances/lib/upload';
import {
  checkPin,
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

type Screen = 'gate' | 'capture' | 'review' | 'result';
type Slot = 'plate' | 'license' | 'odo' | 'pump';

type SlotState = {
  previewUrl: string | null;
  cloudinaryUrl: string | null;
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

const SLOTS: { slot: Slot; label: string; hint: string; num: number }[] = [
  { slot: 'plate',   label: 'Plate',     hint: 'Rear or front',             num: 1 },
  { slot: 'license', label: 'Licence',   hint: 'Driver\u2019s UAE licence', num: 2 },
  { slot: 'odo',     label: 'Odometer',  hint: 'Dashboard km reading',      num: 3 },
  { slot: 'pump',    label: 'Pump',      hint: 'Liters dispensed',          num: 4 },
];

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

  // ----- screen state -----
  const [screen, setScreen] = useState<Screen>('gate');

  // check PIN state on mount — if already authed, jump to capture
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      setScreen('capture');
    }
  }, []);

  // ----- PIN state -----
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setPinSubmitting(true);
    setPinErr('');
    try {
      const ok = await checkPin(pin);
      if (!ok) {
        setPinErr('Wrong PIN');
        setPin('');
        return;
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      setScreen('capture');
    } catch {
      setPinErr('Server error');
    } finally {
      setPinSubmitting(false);
    }
  };

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
    if (screen === 'capture' || screen === 'review') {
      listTrucks().then(setTrucks).catch(() => setTrucks([]));
      listDrivers().then(setDrivers).catch(() => setDrivers([]));
    }
  }, [screen]);

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
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const capturedCount =
    (plate.cloudinaryUrl ? 1 : 0) +
    (license.cloudinaryUrl ? 1 : 0) +
    (odo.cloudinaryUrl ? 1 : 0) +
    (pump.cloudinaryUrl ? 1 : 0);

  const allCaptured =
    capturedCount === 4 &&
    !plate.ocrLoading && !license.ocrLoading && !odo.ocrLoading && !pump.ocrLoading;

  // --------------------------------------------------
  // Move to review
  // --------------------------------------------------
  const goToReview = async () => {
    if (!allCaptured) return;

    const plateOcr   = plate.ocrResult   as PlateResult   | null;
    const licenseOcr = license.ocrResult as LicenseResult | null;
    const odoOcr     = odo.ocrResult     as OdoResult     | null;
    const pumpOcr    = pump.ocrResult    as PumpResult    | null;

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
        truck_id: selectedTruckId || undefined,
        plate_raw: selectedTruckId ? undefined : (plateOcr?.plate_number || plateOcr?.plate_digits || undefined),
        plate_display: selectedTruckId ? undefined : (plateOcr?.plate_number || undefined),
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

  // ===================================================
  // Screen: GATE (PIN)
  // ===================================================
  if (screen === 'gate') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-black to-gray-950 text-white flex flex-col items-center justify-center px-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow to-yellow/70 flex items-center justify-center mb-5 shadow-[0_0_40px_-10px_rgba(250,204,21,0.45)]">
          <Fuel size={40} className="text-black" strokeWidth={2.5} />
        </div>
        <h1 className="font-heading text-4xl mb-1">LOG A FILL</h1>
        <p className="text-gray-500 text-sm mb-8">Enter PIN to continue</p>

        <form onSubmit={submitPin} className="w-full max-w-xs">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            maxLength={10}
            placeholder="••••"
            className="w-full text-center text-3xl tracking-[0.5em] font-heading py-5 rounded-2xl bg-gray-900 text-yellow placeholder-gray-700 border-2 border-gray-800 focus:border-yellow focus:outline-none"
          />
          {pinErr && <p className="text-red-400 text-center text-sm mt-3">{pinErr}</p>}
          <button
            type="submit"
            disabled={pinSubmitting || pin.length < 4}
            className="w-full mt-4 py-5 rounded-2xl bg-yellow text-black font-heading text-2xl active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {pinSubmitting ? <Loader2 size={24} className="animate-spin" /> : 'ENTER'}
          </button>
          <Link
            href="/diesel"
            className="w-full mt-3 py-3 text-gray-500 text-sm flex items-center justify-center gap-1"
          >
            <ArrowLeft size={14} /> Back
          </Link>
        </form>
      </div>
    );
  }

  // ===================================================
  // Screen: RESULT
  // ===================================================
  if (screen === 'result' && result) {
    const flagged = result.computed.flagged;
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-black to-gray-950 text-white flex flex-col items-center justify-center px-6">
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center mb-5 shadow-[0_0_50px_-8px] ${
            flagged
              ? 'bg-red-500 shadow-red-500/50'
              : 'bg-green-500 shadow-green-500/50'
          }`}
        >
          {flagged ? <AlertTriangle size={44} /> : <Check size={52} strokeWidth={3} />}
        </div>
        <h2 className="font-heading text-4xl mb-2">{flagged ? 'FLAGGED' : 'LOGGED'}</h2>
        <p className="text-center text-lg text-gray-200 mb-6 max-w-sm leading-snug">{result.confirmation}</p>

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
            Cost: <span className="text-white font-semibold">{result.computed.cost_aed} AED</span>
            {result.computed.price_per_liter ? ` @ ${result.computed.price_per_liter}/L` : ''}
          </p>
        )}

        <div className="flex gap-3 w-full max-w-sm mt-2">
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
      <div className="min-h-screen bg-gradient-to-b from-black via-black to-gray-950 text-white px-4 pt-4 pb-24">
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
          {SLOTS.map((s) => {
            const st = slotState(s.slot);
            return (
              <div key={s.slot} className="relative aspect-square rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
                {st.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={st.previewUrl} alt={s.label} className="w-full h-full object-cover" />
                )}
                <span className="absolute top-1 left-1 bg-black/80 text-yellow font-heading text-[10px] rounded px-1">{s.num}</span>
              </div>
            );
          })}
        </div>

        {/* Truck */}
        <label className="block text-xs text-gray-400 mb-1 font-heading tracking-wider">TRUCK</label>
        {plateAutoMatchedTruckId && (
          <p className="text-xs text-green-400 mb-1">
            ✓ Auto-matched from plate photo.
          </p>
        )}
        {!plateAutoMatchedTruckId && plateWillAutoCreate && (
          <p className="text-xs text-blue-300 mb-1">
            New plate &quot;{plateOcr?.plate_number || plateOcr?.plate_digits}&quot; — will be added on submit.
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
          className="w-full py-4 px-3 rounded-xl bg-gray-900 text-white border border-gray-700 mb-4 focus:border-yellow focus:outline-none"
        >
          <option value="">{plateWillAutoCreate ? '-- auto-create from photo --' : '-- select truck --'}</option>
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.plate_display} {t.nickname ? `(${t.nickname})` : ''}
            </option>
          ))}
        </select>

        {/* Driver */}
        <label className="block text-xs text-gray-400 mb-1 font-heading tracking-wider">DRIVER</label>
        {driverAutoMatchedId && (
          <p className="text-xs text-green-400 mb-1">
            ✓ Auto-matched from licence photo.
          </p>
        )}
        {!driverAutoMatchedId && driverWillAutoCreate && (
          <p className="text-xs text-blue-300 mb-1">
            New driver &quot;{licenseOcr?.full_name || licenseOcr?.license_number}&quot; — will be added on submit.
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
          className="w-full py-4 px-3 rounded-xl bg-gray-900 text-white border border-gray-700 mb-4 focus:border-yellow focus:outline-none"
        >
          <option value="">{driverWillAutoCreate ? '-- auto-create from licence --' : '-- no driver --'}</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name} {d.nickname ? `(${d.nickname})` : ''}
            </option>
          ))}
        </select>

        {/* Odometer */}
        <label className="block text-xs text-gray-400 mb-1 font-heading tracking-wider">ODOMETER (KM)</label>
        <input
          type="number"
          inputMode="decimal"
          value={odometerKm}
          onChange={(e) => setOdometerKm(e.target.value)}
          className="w-full py-4 px-3 rounded-xl bg-gray-900 text-white border border-gray-700 mb-4 text-lg focus:border-yellow focus:outline-none"
          placeholder="e.g. 142560"
        />

        {/* Liters */}
        <label className="block text-xs text-gray-400 mb-1 font-heading tracking-wider">LITERS FILLED</label>
        <input
          type="number"
          inputMode="decimal"
          value={litersFilled}
          onChange={(e) => setLitersFilled(e.target.value)}
          className="w-full py-4 px-3 rounded-xl bg-gray-900 text-white border border-gray-700 mb-6 text-lg focus:border-yellow focus:outline-none"
          placeholder="e.g. 45.20"
        />

        {submitError && (
          <p className="text-red-400 text-sm text-center mb-3">{submitError}</p>
        )}

        <button
          onClick={doSubmit}
          disabled={submitting || !odometerKm || !litersFilled}
          className="w-full py-5 rounded-2xl bg-green-500 text-white font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40 shadow-[0_0_30px_-10px_rgba(34,197,94,0.7)]"
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
  // Screen: CAPTURE (default after PIN)
  // ===================================================
  const Tile = ({ slot, label, hint, num }: { slot: Slot; label: string; hint: string; num: number }) => {
    const st = slotState(slot);
    const done = !!st.cloudinaryUrl && !st.ocrLoading;
    const error = !!st.ocrError;
    return (
      <button
        onClick={() => openCapture(slot)}
        className={`relative w-full aspect-square rounded-2xl overflow-hidden active:scale-[0.97] transition-all ${
          done
            ? 'border-2 border-green-500 shadow-[0_0_30px_-10px_rgba(34,197,94,0.5)]'
            : error
            ? 'border-2 border-red-500'
            : 'border-2 border-gray-800 hover:border-yellow/60 bg-gray-950'
        }`}
      >
        {/* step number badge */}
        <span className={`absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center font-heading text-sm ${
          done ? 'bg-green-500 text-white' : 'bg-yellow/20 text-yellow border border-yellow/40'
        }`}>
          {done ? <Check size={14} strokeWidth={4} /> : num}
        </span>

        {st.previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={st.previewUrl} alt={label} className="w-full h-full object-cover" />
            {st.ocrLoading && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
                <Loader2 size={32} className="animate-spin text-yellow" />
                <span className="text-[10px] text-yellow mt-2 tracking-wider">READING…</span>
              </div>
            )}
            {error && (
              <div className="absolute bottom-0 inset-x-0 bg-red-600/90 text-white text-[10px] p-1 text-center leading-tight">
                {st.ocrError}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2">
            <CameraIcon size={32} className="text-gray-600" />
            <span className="font-heading text-sm tracking-wider text-gray-300">{label}</span>
            <span className="text-[10px] text-gray-600 px-1 text-center leading-tight">{hint}</span>
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-black to-gray-950 text-white px-4 pt-4 pb-8">
      {/* header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => {
            sessionStorage.removeItem(SESSION_KEY);
            router.push('/diesel');
          }}
          className="flex items-center gap-1 text-gray-500 min-h-[44px]"
        >
          <ArrowLeft size={20} /> Exit
        </button>
        <Link
          href="/diesel/dashboard"
          className="flex items-center gap-1 text-gray-400 text-xs border border-gray-800 rounded-full px-3 py-1.5"
        >
          <LayoutDashboard size={12} /> Manager
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-yellow/20 flex items-center justify-center">
          <Fuel size={22} className="text-yellow" />
        </div>
        <h1 className="font-heading text-3xl">LOG FILL</h1>
      </div>
      <p className="text-sm text-gray-400 mb-5">
        Tap each tile. Snap a clear photo. We&apos;ll read the numbers.
      </p>

      {/* progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
          <span className="font-heading tracking-wider">{capturedCount}/4 CAPTURED</span>
          <span>{capturedCount === 4 ? 'Ready to review' : `${4 - capturedCount} to go`}</span>
        </div>
        <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow transition-all"
            style={{ width: `${(capturedCount / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* 2x2 tile grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {SLOTS.map((s) => <Tile key={s.slot} slot={s.slot} label={s.label} hint={s.hint} num={s.num} />)}
      </div>

      {/* retake option */}
      {capturedCount > 0 && (
        <button
          onClick={() => {
            setPlate(emptySlot());
            setLicense(emptySlot());
            setOdo(emptySlot());
            setPump(emptySlot());
          }}
          className="flex items-center gap-2 text-gray-500 mb-4 text-xs"
        >
          <RotateCcw size={12} /> Clear all & retake
        </button>
      )}

      <button
        onClick={goToReview}
        disabled={!allCaptured}
        className={`w-full py-5 rounded-2xl font-heading text-2xl flex items-center justify-center gap-2 active:scale-95 transition-all ${
          allCaptured
            ? 'bg-yellow text-black shadow-[0_0_30px_-10px_rgba(250,204,21,0.6)]'
            : 'bg-gray-900 text-gray-600 border border-gray-800'
        }`}
      >
        {allCaptured ? (
          <>
            REVIEW
            <ArrowRight size={24} />
          </>
        ) : (
          `TAKE ${4 - capturedCount} MORE`
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
