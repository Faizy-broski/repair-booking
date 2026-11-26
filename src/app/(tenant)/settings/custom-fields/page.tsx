'use client'
import { Sliders } from 'lucide-react'
import { CustomFieldBuilder } from '@/components/shared/custom-field-builder'

export default function CustomFieldsSettingsPage() {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sliders className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-on-surface">Custom Fields</h3>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Add extra fields to repairs, customers, and other records. For repairs, optionally scope fields to a specific repair category (e.g. Phone Repair, Computer Repair) so they only appear on matching tickets.
          </p>
        </div>
      </div>
      
      <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface space-y-1">
        <p className="font-medium">Field Types</p>
        <ul className="list-disc ml-4 space-y-0.5 text-xs text-on-surface-variant">
          <li><strong>Text</strong> — single-line text input</li>
          <li><strong>Text Area</strong> — multi-line text</li>
          <li><strong>Dropdown</strong> — pick from a list</li>
          <li><strong>Checkbox</strong> — yes/no flag</li>
          <li><strong>Number, Date, Phone, Email</strong> — typed inputs with validation</li>
        </ul>
      </div>

      <CustomFieldBuilder />
    </div>
  )
}
