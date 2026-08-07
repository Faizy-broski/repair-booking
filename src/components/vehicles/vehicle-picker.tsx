'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Car, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface VehicleValue {
  id?: string
  registration_number: string
  make?: string | null
  model?: string | null
  colour?: string | null
  tyre_size?: string | null
  notes?: string | null
}

interface VehiclePickerProps {
  customerId: string | null
  value: VehicleValue | null
  onChange: (vehicle: VehicleValue | null) => void
}

interface OtherCustomerVehicle extends VehicleValue {
  customers?: { id: string; first_name: string; last_name: string | null } | null
}

const EMPTY_NEW_VEHICLE: VehicleValue = { registration_number: '', make: '', model: '', colour: '', tyre_size: '', notes: '' }
const normalizePlateClient = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '')

// Vehicle selection for the mobile tyre-fitting vertical, mirroring CustomerSearch's
// pick-existing-or-quick-add UX. Scoped to the selected customer's own vehicles.
// Before adding a brand-new plate, checks whether it's already registered to a
// DIFFERENT customer and warns staff (soft warning — they can still proceed, e.g.
// a shared household vehicle — same "prompt but allow override" pattern used for
// fitter double-booking).
export function VehiclePicker({ customerId, value, onChange }: VehiclePickerProps) {
  const [vehicles, setVehicles] = useState<VehicleValue[]>([])
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [draft, setDraft] = useState<VehicleValue>(EMPTY_NEW_VEHICLE)
  const [plateWarning, setPlateWarning] = useState<{ customerName: string } | null>(null)
  const [checkingPlate, setCheckingPlate] = useState(false)

  const loadVehicles = useCallback(async (custId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vehicles?customer_id=${custId}`)
      const json = await res.json()
      setVehicles((json.data ?? []) as VehicleValue[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (customerId) loadVehicles(customerId)
    else setVehicles([])
  }, [customerId, loadVehicles])

  // Editing the plate invalidates any stale duplicate-plate warning.
  useEffect(() => {
    setPlateWarning(null)
  }, [draft.registration_number])

  function selectVehicle(v: VehicleValue) {
    onChange(v)
    setShowNew(false)
  }

  function clear() {
    onChange(null)
    setDraft(EMPTY_NEW_VEHICLE)
    setPlateWarning(null)
  }

  async function confirmNewVehicle() {
    const plate = draft.registration_number.trim()
    if (!plate) return

    setCheckingPlate(true)
    try {
      const res = await fetch(`/api/vehicles?search=${encodeURIComponent(plate)}`)
      const json = await res.json()
      const matches = (json.data ?? []) as OtherCustomerVehicle[]
      const normalized = normalizePlateClient(plate)
      const otherCustomerMatch = matches.find(
        (m) => normalizePlateClient(m.registration_number) === normalized && m.customers?.id !== customerId
      )
      if (otherCustomerMatch && !plateWarning) {
        const c = otherCustomerMatch.customers
        setPlateWarning({ customerName: c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : 'another customer' })
        return
      }
    } catch {
      // advisory only — if the lookup fails, fall through and let the save proceed
    } finally {
      setCheckingPlate(false)
    }

    onChange({ ...draft, registration_number: plate })
    setShowNew(false)
    setDraft(EMPTY_NEW_VEHICLE)
    setPlateWarning(null)
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        <Car className="h-4 w-4 shrink-0 text-blue-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {value.registration_number.toUpperCase()}
            {!value.id && <span className="ml-1.5 text-[10px] font-semibold uppercase text-blue-600">New</span>}
          </p>
          <p className="text-xs text-gray-500 truncate">{[value.make, value.model].filter(Boolean).join(' ') || 'No make/model'}{value.tyre_size ? ` · ${value.tyre_size}` : ''}</p>
        </div>
        <button type="button" onClick={clear} className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (!customerId) {
    // No customer selected yet (new customer being created) — nothing to search,
    // so go straight to the new-vehicle form.
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Vehicle</p>
        <NewVehicleFields draft={draft} setDraft={setDraft} />
        <PlateWarningBanner warning={plateWarning} />
        <Button type="button" size="sm" onClick={confirmNewVehicle} disabled={!draft.registration_number.trim() || checkingPlate}>
          <Car className="h-3.5 w-3.5" /> {plateWarning ? 'Add Anyway' : checkingPlate ? 'Checking…' : 'Add Vehicle'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {loading ? (
        <p className="text-xs text-gray-400">Loading vehicles…</p>
      ) : vehicles.length > 0 && !showNew ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Select a vehicle <span className="text-red-500">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => selectVehicle(v)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50"
            >
              {v.registration_number.toUpperCase()}
              {(v.make || v.model) && <span className="ml-1 font-normal text-gray-400">{[v.make, v.model].filter(Boolean).join(' ')}</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
          >
            <Plus className="h-3 w-3" /> New vehicle
          </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {vehicles.length > 0 ? 'New Vehicle' : 'No vehicles on file — add one'}
          </p>
          <NewVehicleFields draft={draft} setDraft={setDraft} />
          <PlateWarningBanner warning={plateWarning} />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={confirmNewVehicle} disabled={!draft.registration_number.trim() || checkingPlate}>
              <Car className="h-3.5 w-3.5" /> {plateWarning ? 'Add Anyway' : checkingPlate ? 'Checking…' : 'Add Vehicle'}
            </Button>
            {vehicles.length > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => { setShowNew(false); setPlateWarning(null) }}>Cancel</Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PlateWarningBanner({ warning }: { warning: { customerName: string } | null }) {
  if (!warning) return null
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>This plate is already registered to <strong>{warning.customerName}</strong>. If that&apos;s a different customer (e.g. a shared vehicle), you can add it anyway — otherwise check the registration number.</span>
    </div>
  )
}

export function NewVehicleFields({ draft, setDraft }: { draft: VehicleValue; setDraft: (fn: (d: VehicleValue) => VehicleValue) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Registration Number *"
          placeholder="AB12 CDE"
          value={draft.registration_number}
          onChange={(e) => setDraft((d) => ({ ...d, registration_number: e.target.value }))}
        />
        <Input
          label="Tyre Size"
          placeholder="205/55R16"
          value={draft.tyre_size ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, tyre_size: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Make"
          placeholder="Ford"
          value={draft.make ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, make: e.target.value }))}
        />
        <Input
          label="Model"
          placeholder="Focus"
          value={draft.model ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
        />
      </div>
    </>
  )
}
