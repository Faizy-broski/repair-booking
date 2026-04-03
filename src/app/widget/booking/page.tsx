'use client'
/**
 * Public booking widget — embeddable via iframe.
 * URL: /widget/booking?subdomain=techfix
 *
 * Multi-step flow:
 *   1. Select service category
 *   2. Select date + time slot
 *   3. Enter contact details
 *   4. Confirmation
 */

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronLeft, Calendar, Clock, User, CheckCircle, Loader2 } from 'lucide-react'

interface ServiceCategory {
  id: string
  name: string
  image_url: string | null
}
interface Slot { time: string; available: boolean }
interface BookingConfig { business_name: string; currency: string; slot_duration_minutes: number }

type Step = 'service' | 'datetime' | 'details' | 'confirm'

export default function BookingWidget() {
  const [subdomain, setSubdomain] = useState('')
  const [config, setConfig] = useState<BookingConfig | null>(null)

  // Step state
  const [step, setStep] = useState<Step>('service')

  // Step 1
  const [services, setServices] = useState<ServiceCategory[]>([])
  const [selectedService, setSelectedService] = useState<ServiceCategory | null>(null)

  // Step 2
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Step 3
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', notes: '' })

  // Step 4
  const [submitting, setSubmitting] = useState(false)
  const [bookingRef, setBookingRef] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sub = params.get('subdomain') ?? window.location.hostname.split('.')[0]
    setSubdomain(sub)

    fetch(`/api/public/booking/config?subdomain=${sub}`)
      .then((r) => r.json())
      .then((j) => setConfig(j.data ?? null))
      .catch(() => {})

    fetch(`/api/public/booking/services?subdomain=${sub}`)
      .then((r) => r.json())
      .then((j) => setServices(j.data ?? []))
      .catch(() => {})
  }, [])

  const fetchSlots = useCallback(async (date: string) => {
    if (!selectedService || !subdomain || !date) return
    setLoadingSlots(true)
    setSlots([])
    const res = await fetch(
      `/api/public/booking/slots?subdomain=${subdomain}&service_id=${selectedService.id}&date=${date}`
    )
    const json = await res.json()
    setSlots(json.data ?? [])
    setLoadingSlots(false)
  }, [selectedService, subdomain])

  function handleDateChange(date: string) {
    setSelectedDate(date)
    setSelectedSlot('')
    fetchSlots(date)
  }

  async function handleSubmit() {
    if (!selectedService || !selectedDate || !selectedSlot) return
    if (!form.first_name || !form.email) { setError('First name and email are required'); return }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/public/booking/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subdomain,
        service_id: selectedService.id,
        date: selectedDate,
        time: selectedSlot,
        customer: form,
        notes: form.notes,
      }),
    })
    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(json.error ?? 'Booking failed. Please try again.'); return }
    setBookingRef(json.data?.reference ?? json.data?.id ?? '✓')
    setStep('confirm')
  }

  // Min date: today
  const minDate = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 px-5 py-4 text-white">
          <p className="text-sm font-medium opacity-80">Online Booking</p>
          <p className="text-base font-semibold">{config?.business_name ?? 'Book an Appointment'}</p>
        </div>

        {/* Step indicator */}
        {step !== 'confirm' && (
          <div className="flex border-b border-gray-100">
            {(['service', 'datetime', 'details'] as Step[]).map((s, i) => (
              <div key={s} className={`flex-1 py-2 text-center text-xs font-medium transition-colors ${
                step === s ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'
              }`}>
                {i + 1}. {s === 'service' ? 'Service' : s === 'datetime' ? 'Date & Time' : 'Your Details'}
              </div>
            ))}
          </div>
        )}

        <div className="p-5">
          {/* Step 1: Service selection */}
          {step === 'service' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Select a service</p>
              {services.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No services available</p>
              ) : (
                services.map((svc) => (
                  <button key={svc.id} onClick={() => { setSelectedService(svc); setStep('datetime') }}
                    className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    {svc.name}
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* Step 2: Date + time */}
          {step === 'datetime' && (
            <div className="space-y-4">
              <button onClick={() => setStep('service')} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <ChevronLeft className="h-3 w-3" /> {selectedService?.name}
              </button>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Calendar className="inline h-3.5 w-3.5 mr-1" />Date
                </label>
                <input
                  type="date"
                  min={minDate}
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              {selectedDate && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    <Clock className="inline h-3.5 w-3.5 mr-1" />Available Times
                  </label>
                  {loadingSlots ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>
                  ) : slots.filter((s) => s.available).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-2">No slots available on this date</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {slots.filter((s) => s.available).map((s) => (
                        <button key={s.time} onClick={() => setSelectedSlot(s.time)}
                          className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                            selectedSlot === s.time
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50'
                          }`}>
                          {s.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                disabled={!selectedDate || !selectedSlot}
                onClick={() => setStep('details')}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 3: Contact details */}
          {step === 'details' && (
            <div className="space-y-3">
              <button onClick={() => setStep('datetime')} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <ChevronLeft className="h-3 w-3" /> {selectedDate} at {selectedSlot}
              </button>

              <p className="text-sm font-medium text-gray-700">
                <User className="inline h-4 w-4 mr-1" />Your details
              </p>

              {(['first_name', 'last_name', 'email', 'phone'] as const).map((field) => (
                <input
                  key={field}
                  type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                  placeholder={field.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) + (field === 'first_name' || field === 'email' ? ' *' : '')}
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              ))}
              <textarea
                placeholder="Additional notes (optional)"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
              />

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button
                disabled={submitting}
                onClick={handleSubmit}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Booking'}
              </button>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 'confirm' && (
            <div className="py-6 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Booking Confirmed!</p>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedService?.name} on {selectedDate} at {selectedSlot}
                </p>
                {bookingRef && (
                  <p className="mt-2 text-xs text-gray-400">Reference: <span className="font-mono font-medium text-gray-600">{bookingRef}</span></p>
                )}
              </div>
              <p className="text-xs text-gray-400">A confirmation has been sent to {form.email}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
