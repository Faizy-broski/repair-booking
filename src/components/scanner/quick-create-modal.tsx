'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ExternalLink, Loader2, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { ProductWithStock, QuickCreatePrefill } from '@/hooks/use-barcode-lookup'

const schema = z.object({
  name: z.string().min(1, 'Product name is required'),
  selling_price: z.coerce.number().min(0.01, 'Price must be greater than 0'),
  cost_price: z.coerce.number().min(0).optional().or(z.literal('')),
  item_type: z.enum(['product', 'part']),
  sku: z.string().optional(),
  barcode: z.string(),
})

type FormValues = z.infer<typeof schema>

interface QuickCreateModalProps {
  open: boolean
  onClose: () => void
  barcode: string
  branchId: string | null
  onCreated: (product: ProductWithStock) => void
  prefill?: QuickCreatePrefill
}

export function QuickCreateModal({ open, onClose, barcode, branchId, onCreated, prefill }: QuickCreateModalProps) {
  const [saving, setSaving] = useState(false)

  // Component is conditionally rendered (only mounted when open) so
  // defaultValues correctly picks up prefill data on every fresh mount.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      barcode:       prefill?.barcode ?? barcode,
      item_type:     'product',
      name:          prefill?.name          ?? '',
      selling_price: prefill?.selling_price ?? undefined,
      cost_price:    prefill?.cost_price    ?? '',
      sku:           prefill?.sku           ?? '',
    },
  })

  async function onSubmit(values: FormValues) {
    if (!branchId) {
      toast.error('No branch selected')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: values.name.trim(),
        selling_price: values.selling_price,
        item_type: values.item_type,
        barcode: values.barcode.trim(),
        branch_id: branchId,
        initial_stock: 0,
      }
      if (values.cost_price !== '' && values.cost_price !== undefined) {
        body.cost_price = Number(values.cost_price)
      }
      if (values.sku?.trim()) body.sku = values.sku.trim()

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json?.error?.message ?? 'Failed to create product')
        return
      }

      const json = await res.json()
      const created = json.data ?? json
      toast.success(`"${created.name}" created — you can add more details from the inventory page.`)
      reset()
      onCreated(created as ProductWithStock)
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Quick Create Product"
      description={`No product found for barcode: ${barcode}. Fill in the required fields to create it now.`}
      size="sm"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Prefill source badge */}
        {prefill?.name && (
          <div className="flex items-center gap-2 rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
            <span className="text-xs font-medium text-teal-700">
              ✓ Details auto-filled from QR code{prefill.brand ? ` · ${prefill.brand}` : ''}
            </span>
          </div>
        )}

        {/* Barcode — pre-filled, readonly */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <ScanLine className="h-3.5 w-3.5" /> Scanned Barcode
          </label>
          <input
            {...register('barcode')}
            readOnly
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-700 cursor-default"
          />
        </div>

        {/* Item type toggle */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-500">Item Type</label>
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            {(['product', 'part'] as const).map((type) => (
              <label
                key={type}
                className="flex flex-1 cursor-pointer items-center justify-center py-2 text-sm font-medium transition-colors has-[:checked]:bg-brand-teal has-[:checked]:text-white text-gray-600 hover:bg-gray-50"
              >
                <input type="radio" value={type} {...register('item_type')} className="sr-only" />
                {type === 'product' ? 'Product' : 'Part'}
              </label>
            ))}
          </div>
        </div>

        {/* Product name */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-700">
            Product Name <span className="text-red-500">*</span>
          </label>
          <input
            {...register('name')}
            autoFocus
            placeholder="e.g. iPhone 14 Screen"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
        </div>

        {/* SKU (optional) */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-700">SKU (optional)</label>
          <input
            {...register('sku')}
            placeholder="Leave blank to assign later"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
          />
        </div>

        {/* Pricing row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">
              Selling Price <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">£</span>
              <input
                {...register('selling_price')}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-brand-teal focus:outline-none"
              />
            </div>
            {errors.selling_price && <p className="mt-1 text-xs text-red-500">{errors.selling_price.message}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Cost Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">£</span>
              <input
                {...register('cost_price')}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-brand-teal focus:outline-none"
              />
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Category, brand, supplier and stock levels can be added from the inventory page after creation.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
            ) : (
              <><ExternalLink className="h-3.5 w-3.5" /> Create Product</>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
