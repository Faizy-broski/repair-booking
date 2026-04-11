'use client'
/**
 * ServiceSelector
 * Cascading dropdowns: Manufacturer → Device → Problem (service)
 * When a Problem is selected, it calls onSelect with the resolved values
 * so the parent form can auto-fill device brand, model, issue, and price.
 */
import { useState, useEffect } from 'react'

interface Category     { id: string; name: string }
interface Manufacturer { id: string; name: string }
interface Device       { id: string; name: string; manufacturer_id: string }
interface Problem      { id: string; name: string; price: number; warranty_days: number }

interface ServiceSelection {
  categoryName: string
  manufacturerName: string
  deviceName: string
  problemName: string
  price: number
  warrantyDays: number
}

interface Props {
  onSelect: (selection: ServiceSelection | null) => void
}

export function ServiceSelector({ onSelect }: Props) {
  const [categories,    setCategories]    = useState<Category[]>([])
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [devices,       setDevices]       = useState<Device[]>([])
  const [problems,      setProblems]      = useState<Problem[]>([])

  const [catId,  setCatId]  = useState('')
  const [mfrId,  setMfrId]  = useState('')
  const [devId,  setDevId]  = useState('')
  const [probId, setProbId] = useState('')

  // Load initial lists
  useEffect(() => {
    fetch('/api/services/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? []))
    fetch('/api/services/manufacturers').then((r) => r.json()).then((j) => setManufacturers(j.data ?? []))
  }, [])

  // When brand (manufacturer) changes, load its devices
  useEffect(() => {
    setDevId('')
    setProbId('')
    setProblems([])
    onSelect(null)
    if (!mfrId) { setDevices([]); return }
    fetch(`/api/services/devices?manufacturer_id=${mfrId}`)
      .then((r) => r.json())
      .then((j) => setDevices(j.data ?? []))
  }, [mfrId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When device OR category changes, load problems
  useEffect(() => {
    setProbId('')
    onSelect(null)
    if (!devId && !catId) { setProblems([]); return }
    
    const params = new URLSearchParams()
    if (devId) params.append('device_id', devId)
    if (catId) params.append('category_id', catId)

    fetch(`/api/services/problems?${params}`)
      .then((r) => r.json())
      .then((j) => setProblems(j.data ?? []))
  }, [devId, catId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProblemChange(id: string) {
    setProbId(id)
    if (!id) { onSelect(null); return }
    const problem = problems.find((p) => p.id === id)
    const device  = devices.find((d) => d.id === devId)
    const mfr     = manufacturers.find((m) => m.id === mfrId)
    const cat     = categories.find((c) => c.id === catId)
    
    if (problem) {
      onSelect({
        categoryName:     cat?.name ?? '',
        manufacturerName: mfr?.name ?? '',
        deviceName:       device?.name ?? '',
        problemName:      problem.name,
        price:            problem.price,
        warrantyDays:     problem.warranty_days,
      })
    }
  }

  if (categories.length === 0 && manufacturers.length === 0) return null

  return (
    <div className="rounded-xl border border-brand-teal/20 bg-brand-teal/5 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Service Catalogue Quick-fill</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Device Type</label>
          <select
            value={catId}
            onChange={(e) => { setCatId(e.target.value); onSelect(null); setProbId('') }}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all"
          >
            <option value="">Select Device Type…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Brand</label>
          <select
            value={mfrId}
            onChange={(e) => setMfrId(e.target.value)}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all"
          >
            <option value="">Select Brand…</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Model</label>
          <select
            value={devId}
            onChange={(e) => setDevId(e.target.value)}
            disabled={!mfrId}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
          >
            <option value="">Select Model…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Service</label>
          <select
            value={probId}
            onChange={(e) => handleProblemChange(e.target.value)}
            disabled={!devId && !catId}
            className="h-9 w-full rounded-lg border border-brand-teal bg-white px-3 text-sm font-medium text-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all disabled:opacity-50 disabled:border-gray-300 disabled:text-gray-500 disabled:font-normal"
          >
            <option value="">Select Service…</option>
            {problems.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
