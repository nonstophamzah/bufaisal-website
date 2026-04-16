'use client';

export function RejectConfirmModal({
  itemId,
  onConfirm,
  onCancel,
}: {
  itemId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!itemId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
        <p className="font-heading text-2xl mb-2">REJECT ITEM?</p>
        <p className="text-gray-500 text-sm mb-6">This item will be moved to rejected.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-4 rounded-2xl bg-gray-200 font-bold text-lg active:scale-95"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold text-lg active:scale-95"
          >
            REJECT
          </button>
        </div>
      </div>
    </div>
  );
}
