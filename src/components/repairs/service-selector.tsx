'use client'
/**
 * ServiceSelector
 * Cascading dropdowns: Manufacturer → Device → Problem (service)
 * When a Problem is selected, it calls onSelect with the resolved values
 * so the parent form can auto-fill device brand, model, issue, and price.
 */
import { useState, useEffect } from 'react'

interface Manufacturer { id: string; name: string }
interface Device       { id: string; name: string; manufacturer_id: string }
interface Problem      { id: string; name: string; price: number; warranty_days: number }

interface ServiceSelection {
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
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [devices,       setDevices]       = useState<Device[]>([])
  const [problems,      setProblems]      = useState<Problem[]>([])

  const [mfrId,  setMfrId]  = useState('')
  const [devId,  setDevId]  = useState('')
  const [probId, setProbId] = useState('')

  // Load manufacturers once
  useEffect(() => {
    fetch('/api/services/manufacturers')
      .then((r) => r.json())
      .then((j) => setManufacturers(j.data ?? []))
  }, [])

  // When manufacturer changes, load its devices
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

  // When device changes, load its problems
  useEffect(() => {
    setProbId('')
    onSelect(null)
    if (!devId) { setProblems([]); return }
    fetch(`/api/services/problems?device_id=${devId}`)
      .then((r) => r.json())
      .then((j) => setProblems(j.data ?? []))
  }, [devId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProblemChange(id: string) {
    setProbId(id)
    if (!id) { onSelect(null); return }
    const problem = problems.find((p) => p.id === id)
    const device  = devices.find((d) => d.id === devId)
    const mfr     = manufacturers.find((m) => m.id === mfrId)
    if (problem && device && mfr) {
      onSelect({
        manufacturerName: mfr.name,
        deviceName:       device.name,
        problemName:      problem.name,
        price:            problem.price,
        warrantyDays:     problem.warranty_days,
      })
    }
  }

  if (manufacturers.length === 0) return null

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2">
      <p className="text-xs font-medium text-blue-700">Quick-fill from service catalogue</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Manufacturer</label>
          <select
            value={mfrId}
            onChange={(e) => setMfrId(e.target.value)}
            className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="">Select…</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Device</label>
          <select
            value={devId}
            onChange={(e) => setDevId(e.target.value)}
            disabled={!mfrId}
            className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm disabled:opacity-50"
          >
            <option value="">Select…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Service</label>
          <select
            value={probId}
            onChange={(e) => handleProblemChange(e.target.value)}
            disabled={!devId}
            className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm disabled:opacity-50"
          >
            <option value="">Select…</option>
            {problems.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
