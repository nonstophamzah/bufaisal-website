'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ShopSelector from '../../components/ShopSelector';
import CameraCapture from '../../components/CameraCapture';
import StatusSelector from '../../components/StatusSelector';
import ProblemGrid from '../../components/ProblemGrid';
import ProductTypeGrid from '../../components/ProductTypeGrid';
import SummaryScreen from '../../components/SummaryScreen';
import SuccessFlash from '../../components/SuccessFlash';
import ErrorFlash from '../../components/ErrorFlash';

type Step = 'shop' | 'photos' | 'type' | 'status' | 'problem' | 'jurf' | 'summary';

export default function ShopInPage() {
  const router = useRouter();
  const [worker, setWorker] = useState<{ name: string } | null>(null);
  const [step, setStep] = useState<Step>('shop');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [shopSource, setShopSource] = useState('');
  const [brandPhoto, setBrandPhoto] = useState('');
  const [itemPhoto, setItemPhoto] = useState('');
  const [barcodePhoto, setBarcodePhoto] = useState('');
  const [productType, setProductType] = useState('');
  const [brand, setBrand] = useState('');
  const [itemName, setItemName] = useState('');
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState('');
  const [needsJurf, setNeedsJurf] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('appliance_worker');
    if (!stored) {
      router.replace('/appliances');
      return;
    }
    setWorker(JSON.parse(stored));
  }, [router]);

  // Auto-read brand from photo via Gemini
  const scanBrandPhoto = useCallback(async (url: string) => {
    if (!url) return;
    try {
      const imgRes = await fetch(url);
      const blob = await imgRes.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: blob.type || 'image/jpeg',
          prompt: 'Read the brand name and model from this appliance label/photo. Return JSON: { "brand": "string", "item_name": "string" }. Return ONLY the JSON.',
        }),
      });
      const data = await res.json();
      if (data.text) {
        const match = data.text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.brand) setBrand(parsed.brand);
          if (parsed.item_name) setItemName(parsed.item_name);
        }
      }
    } catch {
      // silent — user can type manually
    }
  }, []);

  const handleConfirm = async () => {
    setSaving(true);
    setErrorMsg('');

    const barcode = `BF-${Date.now().toString(36).toUpperCase()}`;
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });

    const { error } = await supabase.from('appliance_items').insert({
      barcode,
      item_name: itemName || productType,
      product_type: productType,
      brand: brand || null,
      status,
      problem: status === 'Not Working' ? problem : null,
      shop_source: `Shop ${shopSource}`,
      needs_jurf: needsJurf ?? false,
      date_received: today,
      month,
      brand_photo: brandPhoto || null,
      item_photo: itemPhoto || null,
      barcode_photo: barcodePhoto || null,
      created_by: worker?.name || 'Unknown',
    });

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    // Audit log
    await supabase.from('appliance_audit_log').insert({
      user_name: worker?.name,
      action: 'IN',
      details: { barcode, productType, status, shopSource },
    });

    setSaving(false);
    setShowSuccess(true);
  };

  const resetFlow = () => {
    setStep('shop');
    setShopSource('');
    setBrandPhoto('');
    setItemPhoto('');
    setBarcodePhoto('');
    setProductType('');
    setBrand('');
    setItemName('');
    setStatus('');
    setProblem('');
    setNeedsJurf(null);
    setShowSuccess(false);
    setErrorMsg('');
  };

  if (!worker) return null;

  if (showSuccess) {
    return <SuccessFlash onDone={resetFlow} />;
  }

  if (errorMsg) {
    return <ErrorFlash message={errorMsg} onRetry={() => setErrorMsg('')} />;
  }

  const goBack = () => {
    const steps: Step[] = ['shop', 'photos', 'type', 'status', 'problem', 'jurf', 'summary'];
    const idx = steps.indexOf(step);
    if (idx <= 0) {
      router.push('/appliances/shop');
    } else {
      // Skip problem if status isn't Not Working
      let prev = steps[idx - 1];
      if (prev === 'problem' && status !== 'Not Working') prev = 'status';
      if (prev === 'jurf' && status !== 'Not Working') prev = 'status';
      setStep(prev);
    }
  };

  const goNext = () => {
    const steps: Step[] = ['shop', 'photos', 'type', 'status'];
    const idx = steps.indexOf(step);
    if (step === 'status') {
      if (status === 'Not Working') setStep('problem');
      else setStep('summary');
    } else if (step === 'problem') {
      setStep('jurf');
    } else if (step === 'jurf') {
      setStep('summary');
    } else if (idx < steps.length - 1) {
      setStep(steps[idx + 1]);
    }
  };

  // Summary screen
  if (step === 'summary') {
    return (
      <SummaryScreen
        title="CONFIRM NEW ITEM"
        rows={[
          { label: 'Shop', value: `Shop ${shopSource}` },
          { label: 'Product Type', value: productType },
          { label: 'Brand', value: brand },
          { label: 'Item Name', value: itemName },
          { label: 'Status', value: status },
          { label: 'Problem', value: problem },
          { label: 'Needs Jurf', value: needsJurf ? 'Yes' : needsJurf === false ? 'No' : undefined },
        ]}
        photos={[
          { label: 'Brand', url: brandPhoto },
          { label: 'Item', url: itemPhoto },
          { label: 'Barcode', url: barcodePhoto },
        ]}
        onConfirm={handleConfirm}
        onBack={() => setStep(needsJurf !== null ? 'jurf' : status === 'Not Working' ? 'problem' : 'status')}
        loading={saving}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 pt-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={goBack} className="p-1">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="font-heading text-2xl">
            IN — <span className="text-green-500">RECEIVE</span>
          </h1>
          <p className="text-xs text-gray-400">{worker.name} &bull; Step {['shop', 'photos', 'type', 'status', 'problem', 'jurf'].indexOf(step) + 1}</p>
        </div>
      </div>

      {/* STEP: Shop select */}
      {step === 'shop' && (
        <div>
          <p className="font-heading text-xl mb-4">WHICH SHOP?</p>
          <ShopSelector
            value={shopSource}
            onChange={(s) => {
              setShopSource(s);
              setTimeout(() => setStep('photos'), 200);
            }}
          />
        </div>
      )}

      {/* STEP: 3 Photos */}
      {step === 'photos' && (
        <div>
          <p className="font-heading text-xl mb-4">TAKE 3 PHOTOS</p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <CameraCapture
              label="Brand Label"
              value={brandPhoto}
              onChange={(url) => {
                setBrandPhoto(url);
                scanBrandPhoto(url);
              }}
            />
            <CameraCapture label="Full Item" value={itemPhoto} onChange={setItemPhoto} />
            <CameraCapture label="Barcode" value={barcodePhoto} onChange={setBarcodePhoto} />
          </div>

          {(brand || itemName) && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm">
              <p className="font-bold text-green-800">AI Detected:</p>
              {brand && <p>Brand: {brand}</p>}
              {itemName && <p>Name: {itemName}</p>}
            </div>
          )}

          <button
            onClick={goNext}
            disabled={!brandPhoto && !itemPhoto}
            className="w-full py-4 rounded-xl bg-black text-white font-bold text-lg active:scale-95 transition-transform disabled:opacity-30"
          >
            NEXT
          </button>
        </div>
      )}

      {/* STEP: Product Type */}
      {step === 'type' && (
        <div>
          <p className="font-heading text-xl mb-4">PRODUCT TYPE</p>
          <ProductTypeGrid
            value={productType}
            onChange={(t) => {
              setProductType(t);
              setTimeout(goNext, 200);
            }}
          />
        </div>
      )}

      {/* STEP: Status */}
      {step === 'status' && (
        <div>
          <p className="font-heading text-xl mb-4">STATUS</p>
          <StatusSelector
            value={status}
            onChange={(s) => {
              setStatus(s);
              setTimeout(goNext, 200);
            }}
          />
        </div>
      )}

      {/* STEP: Problem (only for Not Working) */}
      {step === 'problem' && (
        <div>
          <p className="font-heading text-xl mb-4">WHAT&apos;S THE PROBLEM?</p>
          <ProblemGrid
            value={problem}
            onChange={(p) => {
              setProblem(p);
              setTimeout(() => setStep('jurf'), 200);
            }}
          />
        </div>
      )}

      {/* STEP: Needs Jurf? */}
      {step === 'jurf' && (
        <div>
          <p className="font-heading text-xl mb-4">SEND TO JURF?</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setNeedsJurf(true);
                setTimeout(() => setStep('summary'), 200);
              }}
              className={`w-full py-5 rounded-xl font-heading text-2xl active:scale-95 transition-all ${
                needsJurf === true
                  ? 'bg-orange-500 text-white ring-4 ring-offset-2 ring-orange-700'
                  : 'bg-gray-200 text-black'
              }`}
            >
              YES — SEND TO JURF
            </button>
            <button
              onClick={() => {
                setNeedsJurf(false);
                setTimeout(() => setStep('summary'), 200);
              }}
              className={`w-full py-5 rounded-xl font-heading text-2xl active:scale-95 transition-all ${
                needsJurf === false
                  ? 'bg-gray-500 text-white ring-4 ring-offset-2 ring-gray-700'
                  : 'bg-gray-200 text-black'
              }`}
            >
              NO — KEEP IN SHOP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
