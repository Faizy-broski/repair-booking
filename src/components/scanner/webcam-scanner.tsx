'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { CameraOff, RefreshCw, MonitorSpeaker, Zap } from 'lucide-react'

interface Props {
  onResult: (code: string) => void
  active: boolean
}

type PermissionState = 'initialising' | 'granted' | 'denied' | 'unavailable'
type Engine = 'native' | 'dual' | 'zxing' | null

const NATIVE_1D_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39']

export function WebcamScanner({ onResult, active }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const lastResult  = useRef<string | null>(null)
  const rafRef      = useRef<number | null>(null)
  const onResultRef = useRef(onResult)
  useEffect(() => { onResultRef.current = onResult }, [onResult])

  const [cameras, setCameras]                   = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>()
  const [permission, setPermission]             = useState<PermissionState>('initialising')
  const [engine, setEngine]                     = useState<Engine>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false
    let stream: MediaStream | null = null

    function emitResult(text: string) {
      if (text === lastResult.current) return
      lastResult.current = text
      onResultRef.current(text)
      setTimeout(() => { lastResult.current = null }, 1500)
    }

    async function start() {
      try {
        const allDevices   = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
        if (cancelled) return
        if (videoDevices.length === 0) { setPermission('unavailable'); return }

        setCameras(videoDevices)
        const rear     = videoDevices.find(d => /back|rear|environment/i.test(d.label))
        const deviceId = selectedDeviceId ?? rear?.deviceId ?? videoDevices[0]?.deviceId

        // One shared stream for all engines
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width:    { ideal: 1280 },
            height:   { ideal: 720 },
            facingMode: deviceId ? undefined : 'environment',
          },
        })
        if (cancelled) return

        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        
        // Attempt to force continuous autofocus if the hardware supports it
        try {
          const track = stream.getVideoTracks()[0]
          const capabilities = track.getCapabilities()
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any)
            console.debug('[Scanner] Autofocus enabled')
          }
        } catch (e) {
          // Ignore if not supported by the browser or camera
        }

        setPermission('granted')

        // ── Determine native capabilities ────────────────────────────────
        let nativeDetectorQR:  any = null   // GPU-accelerated QR
        let nativeDetectorAll: any = null   // GPU-accelerated everything (1D + QR)

        if ('BarcodeDetector' in window) {
          try {
            const supported: string[] = await (window as any).BarcodeDetector.getSupportedFormats()
            console.debug('[Scanner] BarcodeDetector supported formats:', supported)

            const has1D = NATIVE_1D_FORMATS.some(f => supported.includes(f))
            const hasQR = supported.includes('qr_code')

            if (has1D) {
              // Native supports everything — use it alone (fastest path)
              const formats = [...NATIVE_1D_FORMATS, 'qr_code', 'data_matrix', 'pdf417'].filter(f => supported.includes(f))
              nativeDetectorAll = new (window as any).BarcodeDetector({ formats })
              console.debug('[Scanner] Native-only mode, formats:', formats)
              setEngine('native')
            } else if (hasQR) {
              // Native supports QR only — use it for QR + ZXing for 1D in parallel
              nativeDetectorQR = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
              console.debug('[Scanner] Dual mode: native QR + ZXing 1D')
              setEngine('dual')
            }
          } catch (e) {
            console.debug('[Scanner] BarcodeDetector init failed:', e)
          }
        }

        if (!nativeDetectorAll && !nativeDetectorQR) {
          // No native support at all
          console.debug('[Scanner] ZXing-only mode')
          setEngine('zxing')
        }

        // ── ZXing setup (only when needed) ───────────────────────────────
        let zxingReader: any = null
        let canvas: HTMLCanvasElement | null = null
        let ctx: CanvasRenderingContext2D | null = null

        if (!nativeDetectorAll) {
          // ZXing handles 1D barcodes (and QR if native unavailable)
          const [
            { HTMLCanvasElementLuminanceSource },
            { BinaryBitmap, HybridBinarizer, MultiFormatReader, DecodeHintType, BarcodeFormat },
          ] = await Promise.all([
            import('@zxing/browser'),
            import('@zxing/library'),
          ])
          if (cancelled) return

          // When running alongside native QR, restrict ZXing to 1D only to avoid redundant QR work
          const formats = nativeDetectorQR
            ? [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
               BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.DATA_MATRIX]
            : [BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
               BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
               BarcodeFormat.CODE_39, BarcodeFormat.DATA_MATRIX]

          const hints = new Map<number, any>([
            [DecodeHintType.POSSIBLE_FORMATS, formats]
          ])

          const mr = new MultiFormatReader()
          mr.setHints(hints)
          zxingReader = { mr, LumClass: HTMLCanvasElementLuminanceSource, BinaryBitmap, HybridBinarizer }

          canvas = document.createElement('canvas')
          ctx    = canvas.getContext('2d', { willReadFrequently: true })!
          console.debug('[Scanner] ZXing ready, formats:', formats.length, nativeDetectorQR ? '(1D only, QR handled by native)' : '(all formats)')
        }

        // ── Unified RAF loop: native (async, fire-and-forget) + ZXing (sync) ──
        let nativePending = false
        let zxingPending = false
        let lastZxingTime = 0
        const ZXING_INTERVAL = 150 // Faster check (6 times a second)

        function tick() {
          if (cancelled || !videoRef.current) return

          if (videoRef.current.readyState >= 2) {
            const now = Date.now()

            // Native path: fire async, guard against stacking
            const detector = nativeDetectorAll ?? nativeDetectorQR
            if (detector && !nativePending) {
              nativePending = true
              detector.detect(video)
                .then((results: any[]) => {
                  nativePending = false
                  if (results.length > 0) emitResult(results[0].rawValue)
                })
                .catch(() => { nativePending = false })
            }

            // ZXing path: sync decode from canvas frame
            if (zxingReader && canvas && ctx && !zxingPending && (now - lastZxingTime > ZXING_INTERVAL)) {
              zxingPending = true
              lastZxingTime = now
              
              // Simplest, lightest approach. Scale down to a standard 640x480.
              // ZXing was built to decode perfectly at VGA resolutions.
              const W = 640
              const H = 480
              canvas.width = W
              canvas.height = H
              ctx.drawImage(video, 0, 0, W, H)
              
              // Run the decode on the next tick so we don't drop frames
              setTimeout(() => {
                if (cancelled) return
                try {
                  const lum    = new zxingReader.LumClass(canvas)
                  const bmp    = new zxingReader.BinaryBitmap(new zxingReader.HybridBinarizer(lum))
                  const result = zxingReader.mr.decode(bmp)
                  
                  emitResult(result.getText())
                } catch (e: any) {
                  const name = e?.name ?? ''
                  if (name !== 'NotFoundException' && !e?.message?.includes('No MultiFormat Readers')) {
                    // Ignore background scan failed errors silently
                  }
                } finally {
                  zxingPending = false
                }
              }, 0)
            }
          }

          rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
      } catch (err: unknown) {
        if (cancelled) return
        const e = err as Error
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setPermission('denied')
        } else if (e.name === 'NotFoundError') {
          setPermission('unavailable')
        } else {
          setPermission('denied')
          console.error('[WebcamScanner]', e)
        }
      }
    }

    start()

    return () => {
      cancelled = true
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [active, selectedDeviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => {
    setPermission('initialising')
    setEngine(null)
    setSelectedDeviceId(undefined)
  }, [])

  const engineLabel = engine === 'native' ? 'Native · Fast'
    : engine === 'dual' ? 'Dual engine'
    : engine === 'zxing' ? 'ZXing'
    : null

  return (
    <div className="flex flex-col gap-3">
      {permission === 'granted' && cameras.length > 1 && (
        <select
          value={selectedDeviceId ?? ''}
          onChange={e => setSelectedDeviceId(e.target.value || undefined)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-teal focus:outline-none"
        >
          {cameras.map(c => (
            <option key={c.deviceId} value={c.deviceId}>
              {c.label || `Camera ${c.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}

      <div className={`relative w-full overflow-hidden rounded-xl bg-black aspect-video ${
        permission === 'granted' ? 'block' : 'hidden'
      }`}>
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative h-52 w-64">
            <span className="absolute left-0 top-0 h-6 w-6 border-l-[3px] border-t-[3px] border-brand-teal rounded-tl" />
            <span className="absolute right-0 top-0 h-6 w-6 border-r-[3px] border-t-[3px] border-brand-teal rounded-tr" />
            <span className="absolute left-0 bottom-0 h-6 w-6 border-l-[3px] border-b-[3px] border-brand-teal rounded-bl" />
            <span className="absolute right-0 bottom-0 h-6 w-6 border-r-[3px] border-b-[3px] border-brand-teal rounded-br" />
            <div className="absolute left-2 right-2 top-0 h-0.5 bg-brand-teal/80 shadow-[0_0_6px_2px_rgba(20,184,166,0.4)] animate-scan-line" />
          </div>
        </div>

        {engineLabel && (
          <div className="absolute top-2 right-2">
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              engine === 'native' ? 'bg-green-500/90 text-white'
              : engine === 'dual' ? 'bg-blue-500/90 text-white'
              : 'bg-gray-700/80 text-gray-200'
            }`}>
              <Zap className="h-2.5 w-2.5" />
              {engineLabel}
            </span>
          </div>
        )}

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Scanning — point at any barcode or QR code
          </span>
        </div>
      </div>

      {permission === 'initialising' && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-gray-50 border border-gray-200 px-6 py-10 text-center">
          <svg className="h-8 w-8 animate-spin text-brand-teal" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-gray-500">Requesting camera access…</p>
        </div>
      )}

      {permission === 'denied' && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-red-50 border border-red-100 px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <CameraOff className="h-7 w-7 text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Camera access denied</p>
            <p className="mt-1 text-sm text-gray-500">Click the camera icon in your address bar and allow access.</p>
          </div>
          <button onClick={retry} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      )}

      {permission === 'unavailable' && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-gray-50 border border-gray-200 px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <MonitorSpeaker className="h-7 w-7 text-gray-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">No camera detected</p>
            <p className="mt-1 text-sm text-gray-500">Switch to the Physical Scanner tab.</p>
          </div>
        </div>
      )}

      {permission === 'granted' && (
        <p className="text-center text-xs text-gray-400">
          Fill the frame with the barcode — brackets are a visual guide only
        </p>
      )}
    </div>
  )
}
