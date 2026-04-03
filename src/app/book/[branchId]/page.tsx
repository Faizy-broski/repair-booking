'use client'
import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Check, Clock, User, Mail, Phone, FileText, Loader2 } from 'lucide-react'

interface BookingConfig {
  branch: { id: string; name: string; address: string | null; phone: string | null }
  business: { name: string; logo_url: string | null }
  settings: {
    slot_duration_minutes: number
    max_advance_days: number
    cancellation_hours: number
    widget_accent_color: string
    widget_welcome_text: string
  }
  hours: Array<{ day_of_week: number; open_time: string; close_time: string; is_closed: boolean }>
}

interface ServiceOption {
  id: string
  name: string
  price: number | null
  service_categories?: { name: string } | null
  service_devices?: { name: string; service_manufacturers?: { name: string } | null } | null
}

interface TimeSlot {
  start: string
  end: string
  available: boolean
  remaining: number
}

type Step = 'service' | 'date' | 'time' | 'details' | 'confirm' | 'success'

export default function PublicBookingPage({ params }: { params: Promise<{ branchId: string }> }) {
  const [branchId, setBranchId] = useState<string>('')
  const [config, setConfig] = useState<BookingConfig | null>(null)
  const [services, setServices] = useState<ServiceOption[]>([])
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('service')

  // Form state
  const [selectedService, setSelectedService] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [bookingResult, setBookingResult] = useState<{
    booking_token: string
    status: string
    message: string
    start_time: string
  } | null>(null)

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  // Resolve params
  useEffect(() => {
    params.then((p) => setBranchId(p.branchId))
  }, [params])

  // Load config + services
  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    Promise.all([
      fetch(`/api/public/booking/config?branch_id=${branchId}`).then((r) => r.json()),
      fetch(`/api/public/booking/services?branch_id=${branchId}`).then((r) => r.json()),
    ]).then(([configJson, servicesJson]) => {
      if (configJson.error) {
        setError(configJson.error.message)
      } else {
        setConfig(configJson.data)
        setServices(servicesJson.data ?? [])
      }
      setLoading(false)
    })
  }, [branchId])

  // Load slots when date changes
  const fetchSlots = useCallback(async (date: string) => {
    if (!branchId || !date) return
    setSlotsLoading(true)
    const res = await fetch(`/api/public/booking/slots?branch_id=${branchId}&date=${date}`)
    const json = await res.json()
    setSlots(json.data ?? [])
    setSlotsLoading(false)
  }, [branchId])

  useEffect(() => {
    if (selectedDate) fetchSlots(selectedDate)
  }, [selectedDate, fetchSlots])

  // Submit booking
  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/public/booking/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branchId,
        service_id: selectedService || undefined,
        date: selectedDate,
        start_time: selectedSlot,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || undefined,
        customer_note: customerNote || undefined,
      }),
    })
    const json = await res.json()
    setSubmitting(false)
    if (json.error) {
      setError(json.error.message)
    } else {
      setBookingResult(json.data)
      setStep('success')
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const accent = config?.settings.widget_accent_color ?? '#2563eb'

  function isDateAvailable(dateStr: string) {
    if (!config) return false
    const d = new Date(dateStr + 'T00:00:00')
    const dow = d.getDay()
    const hour = config.hours.find((h) => h.day_of_week === dow)
    if (!hour || hour.is_closed) return false

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (d < today) return false

    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + config.settings.max_advance_days)
    if (d > maxDate) return false

    return true
  }

  function getCalendarDays() {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const days: Array<{ date: string; day: number; available: boolean } | null> = []
    for (let i = 0; i < firstDay; i++) days.push(null) // padding
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({ date: dateStr, day: d, available: isDateAvailable(dateStr) })
    }
    return days
  }

  function formatTime(time: string) {
    const [h, m] = time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  const selectedServiceObj = services.find((s) => s.id === selectedService)

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error && !config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-700">Booking Unavailable</p>
          <p className="text-sm text-gray-400 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          {config.business.logo_url && (
            <img src={config.business.logo_url} alt="" className="mx-auto mb-3 h-12 w-auto" />
          )}
          <h1 className="text-xl font-bold text-gray-900">{config.business.name}</h1>
          <p className="text-sm text-gray-500">{config.branch.name}</p>
          <p className="text-sm text-gray-400 mt-1">{config.settings.widget_welcome_text}</p>
        </div>

        {/* Progress Steps */}
        {step !== 'success' && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {(['service', 'date', 'time', 'details', 'confirm'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`h-2 w-8 rounded-full ${
                    (['service', 'date', 'time', 'details', 'confirm'] as Step[]).indexOf(step) >= i
                      ? ''
                      : 'bg-gray-200'
                  }`}
                  style={
                    (['service', 'date', 'time', 'details', 'confirm'] as Step[]).indexOf(step) >= i
                      ? { backgroundColor: accent }
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && step !== 'success' && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Step: Service Selection ──────────────────────────────────── */}
        {step === 'service' && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Select a Service</h2>
            <div className="space-y-2">
              <button
                onClick={() => { setSelectedService(''); setStep('date') }}
                className={`w-full text-left rounded-lg border p-3 transition-colors hover:border-blue-300 ${
                  !selectedService ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <p className="text-sm font-medium text-gray-700">General Appointment</p>
                <p className="text-xs text-gray-400">No specific service selected</p>
              </button>
              {services.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => { setSelectedService(svc.id); setStep('date') }}
                  className={`w-full text-left rounded-lg border p-3 transition-colors hover:border-blue-300 ${
                    selectedService === svc.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{svc.name}</p>
                      {svc.service_devices && (
                        <p className="text-xs text-gray-400">
                          {svc.service_devices.service_manufacturers?.name} {svc.service_devices.name}
                        </p>
                      )}
                    </div>
                    {svc.price && (
                      <span className="text-sm font-semibold" style={{ color: accent }}>
                        £{Number(svc.price).toFixed(2)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: Date Selection ─────────────────────────────────────── */}
        {step === 'date' && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('service')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-sm font-semibold text-gray-900">Choose a Date</h2>
              <div className="w-16" />
            </div>

            {/* Month Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ChevronLeft className="h-5 w-5 text-gray-500" />
              </button>
              <p className="text-sm font-medium text-gray-700">
                {calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </p>
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ChevronRight className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {getCalendarDays().map((cell, idx) => (
                <div key={idx}>
                  {cell ? (
                    <button
                      disabled={!cell.available}
                      onClick={() => { setSelectedDate(cell.date); setSelectedSlot(''); setStep('time') }}
                      className={`w-full aspect-square flex items-center justify-center rounded-lg text-sm transition-colors ${
                        selectedDate === cell.date
                          ? 'text-white font-semibold'
                          : cell.available
                          ? 'text-gray-700 hover:bg-gray-100'
                          : 'text-gray-300 cursor-not-allowed'
                      }`}
                      style={selectedDate === cell.date ? { backgroundColor: accent } : undefined}
                    >
                      {cell.day}
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: Time Selection ─────────────────────────────────────── */}
        {step === 'time' && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('date')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-sm font-semibold text-gray-900">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              <div className="w-16" />
            </div>

            {slotsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : slots.filter((s) => s.available).length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                No available slots for this date
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.filter((s) => s.available).map((slot) => (
                  <button
                    key={slot.start}
                    onClick={() => { setSelectedSlot(slot.start); setStep('details') }}
                    className={`rounded-lg border p-2 text-sm font-medium transition-colors ${
                      selectedSlot === slot.start
                        ? 'text-white border-transparent'
                        : 'text-gray-700 border-gray-200 hover:border-blue-300'
                    }`}
                    style={selectedSlot === slot.start ? { backgroundColor: accent } : undefined}
                  >
                    <Clock className="h-3 w-3 inline mr-1" />
                    {formatTime(slot.start)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step: Customer Details ───────────────────────────────────── */}
        {step === 'details' && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('time')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-sm font-semibold text-gray-900">Your Details</h2>
              <div className="w-16" />
            </div>

            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Full Name *"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  placeholder="Email Address *"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="tel"
                  placeholder="Phone Number (optional)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <textarea
                  placeholder="Additional notes (optional)"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (!customerName.trim() || !customerEmail.trim()) {
                  setError('Name and email are required')
                  return
                }
                setError(null)
                setStep('confirm')
              }}
              disabled={!customerName.trim() || !customerEmail.trim()}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step: Confirmation ───────────────────────────────────────── */}
        {step === 'confirm' && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('details')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-sm font-semibold text-gray-900">Confirm Booking</h2>
              <div className="w-16" />
            </div>

            <div className="space-y-3 rounded-lg bg-gray-50 p-4">
              {selectedServiceObj && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium text-gray-700">{selectedServiceObj.name}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-700">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Time</span>
                <span className="font-medium text-gray-700">{formatTime(selectedSlot)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Duration</span>
                <span className="font-medium text-gray-700">{config.settings.slot_duration_minutes} minutes</span>
              </div>
              {selectedServiceObj?.price && (
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                  <span className="text-gray-500">Price</span>
                  <span className="font-semibold" style={{ color: accent }}>
                    £{Number(selectedServiceObj.price).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1 text-sm">
              <p className="text-gray-700"><span className="text-gray-400">Name:</span> {customerName}</p>
              <p className="text-gray-700"><span className="text-gray-400">Email:</span> {customerEmail}</p>
              {customerPhone && <p className="text-gray-700"><span className="text-gray-400">Phone:</span> {customerPhone}</p>}
              {customerNote && <p className="text-gray-700"><span className="text-gray-400">Notes:</span> {customerNote}</p>}
            </div>

            {config.settings.cancellation_hours > 0 && (
              <p className="text-xs text-gray-400">
                Free cancellation up to {config.settings.cancellation_hours} hours before the appointment.
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: accent }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Booking...' : 'Confirm Booking'}
            </button>
          </div>
        )}

        {/* ── Step: Success ────────────────────────────────────────────── */}
        {step === 'success' && bookingResult && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full flex items-center justify-center" style={{ backgroundColor: accent + '20' }}>
              <Check className="h-8 w-8" style={{ color: accent }} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {bookingResult.status === 'confirmed' ? 'Booking Confirmed!' : 'Booking Submitted!'}
            </h2>
            <p className="text-sm text-gray-500">{bookingResult.message}</p>

            <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Date & Time</span>
                <span className="font-medium text-gray-700">
                  {new Date(bookingResult.start_time).toLocaleDateString('en-GB', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })} at {formatTime(selectedSlot)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Reference</span>
                <span className="font-mono text-xs text-gray-700">{bookingResult.booking_token.slice(0, 12).toUpperCase()}</span>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              A confirmation has been sent to {customerEmail}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-300">
            {config.branch.address && <span>{config.branch.address} · </span>}
            {config.branch.phone && <span>{config.branch.phone}</span>}
          </p>
        </div>
      </div>
    </div>
  )
}
