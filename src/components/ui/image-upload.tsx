'use client'
import { useRef, useState } from 'react'
import { ImagePlus, X, Loader2, Link as LinkIcon, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageUploadProps {
  /** Current image URL (Supabase storage or external) */
  value: string
  onChange: (url: string) => void
  label?: string
  /** Compact mode: small square used in catalogue list rows */
  compact?: boolean
  className?: string
}

/**
 * ImageUpload — supports both file upload (Supabase storage) and manual URL entry.
 *
 * Usage:
 *   <ImageUpload value={imageUrl} onChange={setImageUrl} label="Product image" />
 *
 * Compact mode (for catalogue rows):
 *   <ImageUpload value={imageUrl} onChange={setImageUrl} compact />
 */
export function ImageUpload({ value, onChange, label, compact = false, className }: ImageUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft]   = useState('')

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload/image', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Upload failed')
      } else {
        onChange(json.url)
      }
    } catch {
      setError('Network error — please try again')
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
            'relative h-8 w-8 rounded-lg overflow-hidden border-2 transition-all',
            value
              ? 'border-transparent hover:border-brand-teal'
              : 'border-dashed border-gray-300 hover:border-brand-teal bg-gray-50'
          )}
        >
          {uploading ? (
            <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-brand-teal" />
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
            <ImagePlus className="absolute inset-0 m-auto h-3.5 w-3.5 text-gray-400" />
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600"
            title="Remove image"
          >
            <X className="h-2.5 w-2.5" />
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
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'relative flex items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors',
          'hover:border-brand-teal/50 hover:bg-teal-50/30',
          uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer',
          value ? 'border-gray-200 bg-gray-50' : 'border-gray-300 bg-white'
        )}
        onClick={() => !showUrlInput && fileRef.current?.click()}
      >
        {/* Thumbnail */}
        <div className="relative shrink-0">
          {value ? (
            <>
              <img
                key={value}
                src={value}
                alt="Preview"
                className="h-20 w-20 rounded-lg border border-gray-200 object-contain bg-white"
                onError={() => setError('Image URL could not be loaded')}
                onLoad={() => setError(null)}
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(''); setError(null) }}
                className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600 z-10"
                title="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-brand-teal" />
              ) : (
                <>
                  <Upload className="h-6 w-6" />
                  <span className="mt-1 text-[10px]">Upload</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {uploading ? (
            <p className="text-sm text-brand-teal font-medium">Uploading…</p>
          ) : value ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-700">Image uploaded</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs text-brand-teal hover:underline"
              >
                Replace image
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">
                Drag & drop or{' '}
                <span className="text-brand-teal">click to browse</span>
              </p>
              <p className="text-xs text-gray-400">JPG, PNG, WebP, GIF — max 5 MB</p>

              {/* URL input toggle */}
              {showUrlInput ? (
                <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
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
                    className="h-7 flex-1 min-w-0 rounded border border-gray-300 px-2 text-xs focus:border-brand-teal focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={commitUrl}
                    className="h-7 px-2.5 rounded bg-brand-teal text-white text-xs font-medium hover:bg-brand-teal/90"
                  >
                    Use URL
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowUrlInput(false); setUrlDraft('') }}
                    className="h-7 px-1.5 rounded text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowUrlInput(true) }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-teal mt-1"
                >
                  <LinkIcon className="h-3 w-3" /> Use image URL instead
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
          <X className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}
