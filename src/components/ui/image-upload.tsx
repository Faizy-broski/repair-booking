'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { ImagePlus, X, Loader2, Link as LinkIcon, Upload, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageUploadProps {
  /** Current image URL (Supabase storage or external) */
  value: string
  onChange: (url: string) => void
  label?: string
  /** Compact mode: small square used in catalogue list rows */
  compact?: boolean
  /** Compact mode only — square size. Defaults to 'sm' (32px). */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const COMPACT_SIZES = {
  sm: { box: 'h-8 w-8', icon: 'h-3.5 w-3.5', remove: 'h-4 w-4 -top-1 -right-1', removeIcon: 'h-2.5 w-2.5', spinner: 'h-4 w-4' },
  md: { box: 'h-12 w-12', icon: 'h-5 w-5', remove: 'h-5 w-5 -top-1.5 -right-1.5', removeIcon: 'h-3 w-3', spinner: 'h-5 w-5' },
  lg: { box: 'h-16 w-16', icon: 'h-6 w-6', remove: 'h-5 w-5 -top-1.5 -right-1.5', removeIcon: 'h-3 w-3', spinner: 'h-6 w-6' },
} as const

/**
 * ImageUpload — supports both file upload (Supabase storage) and manual URL entry.
 *
 * Usage:
 *   <ImageUpload value={imageUrl} onChange={setImageUrl} label="Product image" />
 *
 * Compact mode (for catalogue rows):
 *   <ImageUpload value={imageUrl} onChange={setImageUrl} compact />
 */
export function ImageUpload({ value, onChange, label, compact = false, size = 'sm', className }: ImageUploadProps) {
  const fileRef    = useRef<HTMLInputElement>(null)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)

  const [uploading, setUploading]       = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft]         = useState('')
  const [camOpen, setCamOpen]           = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!camOpen) { stopStream(); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      })
      .catch(() => {
        setError('Camera access denied or not available')
        setCamOpen(false)
      })
    return stopStream
  }, [camOpen, stopStream])

  function capturePhoto() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    canvas.toBlob(async blob => {
      if (!blob) return
      stopStream()
      setCamOpen(false)
      await handleFile(new File([blob], 'webcam.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  async function handleFile(file: File) {
    setError(null)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large — maximum size is 10 MB')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload/image', { method: 'POST', body: form })
      if (res.status === 413) {
        setError('Image is too large — please use an image under 10 MB')
        return
      }
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Upload failed')
      } else {
        onChange(json.url)
      }
    } catch {
      setError('Upload failed — please check your connection and try again')
    } finally {
      setUploading(false)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // reset so same file can be re-selected
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function commitUrl() {
    let trimmed = urlDraft.trim()
    if (trimmed) {
      if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/') && !trimmed.startsWith('data:') && !trimmed.startsWith('blob:')) {
        trimmed = 'https://' + trimmed
      }
      if (trimmed.toLowerCase().startsWith('http://')) {
        trimmed = trimmed.replace(/^http:\/\//i, 'https://')
      }
      onChange(trimmed)
      setError(null)
    }
    setShowUrlInput(false)
    setUrlDraft('')
  }

  // ── Compact variant (catalogue rows) ──────────────────────────────────────

  if (compact) {
    const s = COMPACT_SIZES[size]
    return (
      <div className={cn('relative shrink-0', className)}>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title={value ? 'Change image' : 'Upload image'}
          className={cn(
            'relative rounded-lg overflow-hidden border-2 transition-all',
            s.box,
            value
              ? 'border-transparent hover:border-brand-teal'
              : 'border-dashed border-gray-300 hover:border-brand-teal bg-gray-50'
          )}
        >
          {uploading ? (
            <Loader2 className={cn('absolute inset-0 m-auto animate-spin text-brand-teal', s.spinner)} />
          ) : value ? (
            <img
              key={value}
              src={value}
              alt="Preview"
              className="h-full w-full object-cover"
              onError={() => setError('Image URL could not be loaded')}
              onLoad={() => setError(null)}
            />
          ) : (
            <ImagePlus className={cn('absolute inset-0 m-auto text-gray-400', s.icon)} />
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            className={cn('absolute flex items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600', s.remove)}
            title="Remove image"
          >
            <X className={s.removeIcon} />
          </button>
        )}
      </div>
    )
  }

  // ── Full variant (product / part detail page) ─────────────────────────────

  return (
    <div className={cn('w-full', className)}>
      {label && <p className="mb-1.5 text-sm font-medium text-gray-700">{label}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Preview + drop zone */}
      {value ? (
        /* ── Has image: full-cover preview ── */
        <div className="group relative w-full overflow-hidden rounded-xl border border-brand-teal/30 bg-gray-100" style={{ height: 200 }}>
          <img
            key={value}
            src={value}
            alt="Preview"
            className="h-full w-full object-contain"
            onError={() => setError('Image URL could not be loaded')}
            onLoad={() => setError(null)}
          />
          {/* Dark overlay on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
          {/* Replace button — centre, appears on hover */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Upload className="h-6 w-6 text-white drop-shadow" />
            <span className="text-xs font-semibold text-white drop-shadow">Click to replace</span>
          </button>
          {/* Remove button — top-right corner */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); setError(null) }}
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600 transition-colors"
            title="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        /* ── No image: full drop zone ── */
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !showUrlInput && fileRef.current?.click()}
          className={cn(
            'relative rounded-xl border-2 border-dashed transition-all',
            uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer',
            'border-brand-teal/30 bg-gradient-to-br from-brand-teal/5 to-blue-50/40 hover:border-brand-teal/60 hover:from-brand-teal/10 hover:to-blue-50/60'
          )}
        >
          <div className="flex flex-col items-center justify-center gap-2 py-7 px-4">
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-brand-teal" />
                <p className="text-sm font-medium text-brand-teal">Uploading…</p>
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">
                    Drag & drop or{' '}
                    <span className="text-brand-teal">click to browse</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">JPG, PNG, WebP, GIF — max 10 MB</p>
                </div>

                {showUrlInput ? (
                  <div className="flex w-full max-w-sm gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      type="url"
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitUrl()
                        if (e.key === 'Escape') { setShowUrlInput(false); setUrlDraft('') }
                      }}
                      placeholder="https://example.com/image.jpg"
                      className="h-7 flex-1 min-w-0 rounded-lg border border-gray-300 px-2 text-xs focus:border-brand-teal focus:outline-none"
                    />
                    <button type="button" onClick={commitUrl} className="h-7 px-2.5 rounded-lg bg-brand-teal text-white text-xs font-medium hover:bg-brand-teal/90">Use URL</button>
                    <button type="button" onClick={() => { setShowUrlInput(false); setUrlDraft('') }} className="h-7 px-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setShowUrlInput(true) }} className="flex items-center gap-1 rounded-lg bg-brand-teal/10 border border-brand-teal/20 px-2.5 py-1 text-xs text-brand-teal font-medium hover:bg-brand-teal hover:text-white transition-colors">
                      <LinkIcon className="h-3 w-3" /> Use image URL
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setCamOpen(true) }} className="flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs text-blue-600 font-medium hover:bg-blue-600 hover:text-white transition-colors">
                      <Camera className="h-3 w-3" /> Take photo
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
          <X className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {/* Webcam modal */}
      {camOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { stopStream(); setCamOpen(false) }}>
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">Take a photo</p>
              <button type="button" onClick={() => { stopStream(); setCamOpen(false) }} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-black">
              <video ref={videoRef} className="w-full max-h-72 object-contain" playsInline muted />
            </div>
            <div className="flex justify-center px-4 py-3">
              <button
                type="button"
                onClick={capturePhoto}
                className="flex items-center gap-2 rounded-lg bg-brand-teal px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-teal/90 transition-colors"
              >
                <Camera className="h-4 w-4" /> Capture
              </button>
            </div>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
