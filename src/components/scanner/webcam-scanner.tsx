'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { CameraOff, RefreshCw, MonitorSpeaker, Zap } from 'lucide-react'

interface Props {
  onResult: (code: string, format: string) => void
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

    function emitResult(text: string, format: string, fromNative: boolean) {
      console.debug(`[WEBCAM] emitResult — src=${fromNative ? 'native' : 'zxing'} format=${format} text=${JSON.stringify(text)}`)

      if (text === lastResult.current) {
        console.debug('[WEBCAM]   → SKIPPED (dedup)')
        return
      }

      lastResult.current = text
      console.debug('[WEBCAM]   → FIRING')
      onResultRef.current(text, format)
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

        // Shared format name map used in both init log and per-decode log
        const FMT_MAP_INIT: Record<number, string> = {
          0: 'aztec', 1: 'codabar', 2: 'code_39', 3: 'code_93', 4: 'code_128',
          5: 'data_matrix', 6: 'ean_8', 7: 'ean_13', 8: 'itf', 9: 'maxicode',
          10: 'pdf417', 11: 'qr_code', 12: 'rss_14', 13: 'rss_expanded',
          14: 'upc_a', 15: 'upc_e', 16: 'upc_ean_extension',
        }

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

          // When running alongside native QR, restrict ZXing to 1D only
          const formats = nativeDetectorQR
            ? [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
               BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
               BarcodeFormat.CODABAR, BarcodeFormat.DATA_MATRIX]
            : [BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
               BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
               BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
               BarcodeFormat.DATA_MATRIX]

          const hints = new Map<number, any>([
            [DecodeHintType.POSSIBLE_FORMATS, formats],
            // TRY_HARDER makes ZXing do exhaustive row/column scanning instead of
            // a quick centre-row pass. Critical for 1D barcodes — without it ZXing
            // only samples the middle row and misses any barcode not perfectly centred.
            [DecodeHintType.TRY_HARDER, true],
          ])

          const mr = new MultiFormatReader()
          mr.setHints(hints)
          zxingReader = { mr, LumClass: HTMLCanvasElementLuminanceSource, BinaryBitmap, HybridBinarizer }

          canvas = document.createElement('canvas')
          ctx    = canvas.getContext('2d', { willReadFrequently: true })!
          console.debug('[Scanner] ZXing ready — TRY_HARDER ON — formats:', formats.map(f => FMT_MAP_INIT[f] ?? f).join(', '), nativeDetectorQR ? '(1D only)' : '(all formats)')
        }

        // ── Debug counters (reset every 3 s so the log stays readable) ──────
        let dbg_zxingAttempts   = 0
        let dbg_zxingNotFound   = 0
        let dbg_zxingSuccess    = 0
        let dbg_zxingOtherErr   = 0
        let dbg_nativeAttempts  = 0
        let dbg_nativeFound     = 0
        let dbg_lastReportTime  = Date.now()
        const DBG_REPORT_MS     = 3000

        function dbgReport() {
          const now = Date.now()
          if (now - dbg_lastReportTime < DBG_REPORT_MS) return
          dbg_lastReportTime = now

          console.group(`[WEBCAM DEBUG] ── ${new Date().toLocaleTimeString()} ──────────────────`)
          console.debug(`  engine         : ${engine ?? 'loading'}`)
          console.debug(`  ZXing attempts : ${dbg_zxingAttempts}  (every ~150 ms)`)
          console.debug(`  ZXing ✅ found : ${dbg_zxingSuccess}`)
          console.debug(`  ZXing ❌ notFound (no barcode in frame): ${dbg_zxingNotFound}`)
          console.debug(`  ZXing ⚠ other errors: ${dbg_zxingOtherErr}`)
          console.debug(`  Native attempts: ${dbg_nativeAttempts}`)
          console.debug(`  Native ✅ found: ${dbg_nativeFound}`)

          if (dbg_zxingAttempts > 0) {
            const hitRate = ((dbg_zxingSuccess / dbg_zxingAttempts) * 100).toFixed(1)
            console.debug(`  ZXing hit rate : ${hitRate}%`)
            if (dbg_zxingSuccess === 0) {
              console.warn('  ⚠ ZXing NEVER decoded anything — barcode likely out of frame, too small, blurry, or unsupported format')
            }
          }

          // Reset counters
          dbg_zxingAttempts = dbg_zxingNotFound = dbg_zxingSuccess = dbg_zxingOtherErr = 0
          dbg_nativeAttempts = dbg_nativeFound = 0
          console.groupEnd()
        }

        // ── Brightness sampler — helps diagnose lighting issues ─────────────
        function sampleBrightness(imageData: ImageData): { avg: number; min: number; max: number } {
          const d = imageData.data
          let sum = 0, min = 255, max = 0
          // Sample every 40th pixel (fast approximation)
          for (let i = 0; i < d.length; i += 160) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
            sum += lum; if (lum < min) min = lum; if (lum > max) max = lum
          }
          return { avg: Math.round(sum / (d.length / 160)), min: Math.round(min), max: Math.round(max) }
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

            // Emit periodic debug report
            dbgReport()

            // Native path: fire async, guard against stacking
            const detector = nativeDetectorAll ?? nativeDetectorQR
            if (detector && !nativePending) {
              nativePending = true
              dbg_nativeAttempts++
              detector.detect(video)
                .then((results: any[]) => {
                  nativePending = false
                  if (results.length > 0) {
                    dbg_nativeFound++
                    console.debug('[WEBCAM] Native BarcodeDetector results:', results.map(r => ({ format: r.format, rawValue: JSON.stringify(r.rawValue) })))
                    emitResult(results[0].rawValue, results[0].format, true)
                  }
                })
                .catch((err: any) => {
                  console.debug('[WEBCAM] Native BarcodeDetector error:', err)
                  nativePending = false
                })
            }

            // ZXing path: sync decode from canvas frame
            if (zxingReader && canvas && ctx && !zxingPending && (now - lastZxingTime > ZXING_INTERVAL)) {
              zxingPending = true
              lastZxingTime = now
              dbg_zxingAttempts++

              // Use native video resolution — scaling down to 640x480 made bars
              // sub-pixel thin for 1D barcodes. Cap at 1920x1080 for performance.
              const vW = video.videoWidth  || 1280
              const vH = video.videoHeight || 720
              const scale = Math.min(1, 1920 / vW, 1080 / vH)
              const W = Math.round(vW * scale)
              const H = Math.round(vH * scale)

              canvas.width  = W
              canvas.height = H
              ctx.drawImage(video, 0, 0, W, H)

              // Also prepare a second canvas: a 2× zoomed centre crop so ZXing
              // sees bigger bars when the barcode is small in the frame.
              // The viewfinder brackets cover ~60% w × 55% h of the video area.
              const cropX = Math.round(W * 0.20)
              const cropY = Math.round(H * 0.22)
              const cropW = Math.round(W * 0.60)
              const cropH = Math.round(H * 0.55)
              const cropCanvas = document.createElement('canvas')
              cropCanvas.width  = Math.min(cropW * 2, 1920)
              cropCanvas.height = Math.min(cropH * 2, 1080)
              const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true })!
              cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropCanvas.width, cropCanvas.height)

              // Brightness sample from the cropped centre region
              const centreStrip = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height)
              const brightness  = sampleBrightness(centreStrip)

              console.debug(
                `[WEBCAM] ZXing attempt — fullFrame: ${W}×${H}  crop: ${cropCanvas.width}×${cropCanvas.height}`,
                `| brightness avg=${brightness.avg} min=${brightness.min} max=${brightness.max}`
              )

              function zxingDecode(src: HTMLCanvasElement, label: string): { text: string; format: string } | null {
                try {
                  const lum    = new zxingReader.LumClass(src)
                  const bmp    = new zxingReader.BinaryBitmap(new zxingReader.HybridBinarizer(lum))
                  const result = zxingReader.mr.decode(bmp)
                  const text    = result.getText()
                  const fmtEnum = result.getBarcodeFormat?.()
                  const format  = (fmtEnum != null && FMT_MAP_INIT[fmtEnum]) ? FMT_MAP_INIT[fmtEnum] : 'unknown'
                  console.debug(`[WEBCAM] ZXing ✅ [${label}] format=${format}(${fmtEnum}) text=${JSON.stringify(text)}`)
                  return { text, format }
                } catch (e: any) {
                  const name = e?.name ?? ''
                  if (name === 'NotFoundException' || e?.message?.includes('No MultiFormat Readers')) {
                    console.debug(`[WEBCAM] ZXing ❌ [${label}] NotFoundException`)
                    return null
                  }
                  console.warn(`[WEBCAM] ZXing ⚠ [${label}] ${e?.name}: ${e?.message}`)
                  return null
                }
              }

              // Run decode on next tick so we don't block the animation frame
              setTimeout(() => {
                if (cancelled) return
                try {
                  // Try full-frame first, then the zoomed crop as fallback
                  const hit = zxingDecode(canvas, `full ${W}×${H}`) ?? zxingDecode(cropCanvas, `crop ${cropCanvas.width}×${cropCanvas.height}`)

                  if (hit) {
                    dbg_zxingSuccess++
                    emitResult(hit.text, hit.format, false)
                  } else {
                    dbg_zxingNotFound++
                    if (dbg_zxingNotFound % 10 === 1) {
                      console.debug(
                        `[WEBCAM] ZXing ❌ NotFoundException #${dbg_zxingNotFound} (both passes failed)`,
                        `| brightness avg=${brightness.avg} min=${brightness.min} max=${brightness.max}`,
                        '| tip: avg<30=too dark  avg>220=overexposed  max-min<50=low contrast  0%=barcode out of viewfinder'
                      )
                    }
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
