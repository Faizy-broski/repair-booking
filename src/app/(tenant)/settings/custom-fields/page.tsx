'use client'
import { Sliders } from 'lucide-react'
import { CustomFieldBuilder } from '@/components/shared/custom-field-builder'

export default function CustomFieldsSettingsPage() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Custom Fields</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Add extra fields to repairs, customers, and other records. For repairs, optionally scope fields to a specific repair category (e.g. Phone Repair, Computer Repair) so they only appear on matching tickets.
          </p>
        </div>
        <Sliders className="h-5 w-5 shrink-0 text-brand-teal mt-0.5" />
      </div>
      
      <div className="rounded-lg bg-brand-teal-light border border-brand-teal-light px-4 py-3 text-sm text-brand-teal-dark space-y-1">
        <p className="font-medium">Field Types</p>
        <ul className="list-disc ml-4 space-y-0.5 text-xs text-brand-teal">
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
