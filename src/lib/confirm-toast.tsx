import { toast } from 'sonner'

const DESTRUCTIVE = new Set(['Delete', 'Disconnect', 'Cancel'])

export function confirmToast(message: string, confirmLabel = 'Confirm'): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false
    const safe = (val: boolean) => { if (!resolved) { resolved = true; resolve(val) } }

    const isDestructive = DESTRUCTIVE.has(confirmLabel)

    toast.custom(
      (id) => (
        <div className="w-[360px] rounded-2xl bg-white shadow-2xl border border-gray-100 p-6 flex flex-col gap-4">
          <p className="text-sm font-medium text-gray-800 leading-relaxed">{message}</p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { toast.dismiss(id); safe(false) }}
              className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { toast.dismiss(id); safe(true) }}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors ${
                isDestructive
                  ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                  : 'bg-gray-900 hover:bg-gray-800 active:bg-gray-950'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      {
        duration:  Infinity,
        position:  'top-center',
        onDismiss: () => safe(false),
      }
    )
  })
}
