import type { InvoiceSettings, SocialLinks } from '@/types/invoice-settings'
import { formatCurrency } from '@/lib/utils'

const SOCIAL_LABELS: Record<keyof SocialLinks, string> = {
  website: 'Web', facebook: 'FB', instagram: 'IG',
  twitter: 'TW', whatsapp: 'WA', tiktok: 'TT',
}

function money(n: number, currency?: string) {
  return formatCurrency(n, currency)
}

function num(n: number) {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n)
}

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface ReceiptPrintData {
  settings: InvoiceSettings
  invoiceNumber: string
  status: string
  issuedAt: string
  businessName: string
  branchName?: string | null
  branchAddress?: string | null
  branchPhone?: string | null
  customerName: string
  deviceImei?: string
  faults?: string
  items: Array<{ description: string; quantity: number; unit_price: number; discount?: number; original_unit_price?: number | null }>
  subtotal: number
  discount?: number
  tax?: number
  total: number
  amountPaid?: number
  currency?: string
}

// ─── HTML builder ────────────────────────────────────────────────────────────
// NOTE: @page size is intentionally omitted here.
// We inject it dynamically in printReceipt() AFTER measuring the rendered content.
// Using a fixed height here caused the 2-page split (browser clipped at 297mm).

function buildHtml(d: ReceiptPrintData, debugMode = false): string {
  const {
    settings, invoiceNumber, status, issuedAt,
    businessName, branchName, branchAddress, branchPhone, customerName, deviceImei, faults,
    items, subtotal, discount = 0, tax = 0, total, amountPaid = 0, currency = 'GBP',
  } = d

  const pc       = settings.primary_color ?? '#0f766e'
  const bal      = Math.max(0, total - amountPaid)
  const w        = settings.paper_size === 'Receipt58' ? '58mm'
                 : settings.paper_size === 'Custom'    ? `${settings.custom_width ?? 80}mm`
                 : '80mm'
  const date     = new Date(issuedAt).toLocaleDateString('en-GB')
  const thankYou = settings.thank_you_message || 'Thank you for your business!'

  const bnParts = (businessName || '').split('|')
  const mainBn = bnParts[0].trim()
  const tagline = bnParts.length > 1 ? bnParts[1].trim() : null

  const socials = Object.entries(settings.social_links ?? {})
    .filter(([, v]) => !!v)
    .map(([k, v]) => ({
      label: SOCIAL_LABELS[k as keyof SocialLinks],
      val: String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    }))

  const footerLines = [settings.footer_line_1, settings.footer_line_2, settings.footer_line_3]
    .filter((l): l is string => !!l && l !== settings.thank_you_message)

  // ── CSS ──────────────────────────────────────────────────────────────────
  // @page size is NOT set here — injected dynamically after render measurement.
  // margin:0 is set here so it applies to the static CSS shipped with the HTML.
  // portrait: force portrait so Windows thermal drivers never auto-rotate.
  const css = `
    @page { margin: 0; size: auto portrait }
    * { box-sizing: border-box; margin: 0; padding: 0 }
    html, body {
      width: ${w};
      /* No min-height / height — let content define the height */
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 10px 10px 20px 10px }
    .c  { text-align: center }
    .logo { display: block; margin: 0 auto 6px; width: 48px; height: 48px; object-fit: contain }
    .bn { font-size: 15px; font-weight: bold; text-align: center; margin-bottom: 2px }
    .br { font-size: 11px; color: #000; text-align: center; margin-bottom: 2px }
    .dt { font-size: 11px; color: #000; text-align: center; margin-bottom: 2px }
    hr  { border: none; border-top: 1px dashed #000; margin: 6px 0 }
    .ino { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 2px }
    .row { display: flex; justify-content: space-between; margin-bottom: 2px }
    .lbl { font-size: 11px; color: #000; font-weight: 700 }
    .val { font-size: 11px; font-weight: bold; color: #000 }
    /* ── Items table ── */
    .it  { width: 100%; border-collapse: collapse; margin: 0 }
    .it th { font-size: 10px; color: #000; font-weight: 700; padding: 0 2px 4px 2px; border-bottom: 1px solid #000 }
    .it td { font-size: 11px; padding: 4px 2px; vertical-align: top }
    .it td.nm { font-weight: 700; color: #000; word-break: break-word; white-space: pre-wrap }
    .it td.qt { text-align: center; white-space: nowrap; color: #000; font-weight: 600 }
    .it td.un { text-align: center; white-space: nowrap; color: #000; font-weight: 600 }
    .it td.dc { text-align: center; white-space: nowrap; color: #000; font-weight: 600 }
    .it td.am { text-align: right; font-weight: bold; color: #000; white-space: nowrap }
    .it th.qt, .it th.un, .it th.dc, .it th.am { width: 1%; white-space: nowrap; text-align: center; padding-left: 6px }
    .it th.am { text-align: right }
    .it td.qt, .it td.un, .it td.dc, .it td.am { padding-left: 6px }
    .tr  { display: flex; justify-content: space-between; margin-bottom: 2px }
    .tl  { font-size: 11px; color: #000; font-weight: 700 }
    .tv  { font-size: 11px; font-weight: bold; color: #000 }
    .gr  { display: flex; justify-content: space-between; margin-top: 4px }
    .gl  { font-size: 15px; font-weight: bold; color: #000 }
    .gv  { font-size: 15px; font-weight: bold; color: #000 }
    .bar {
      display: flex; justify-content: space-between;
      background: #000; padding: 7px; border-radius: 3px; margin-top: 5px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact
    }
    .bl { font-size: 13px; font-weight: bold; color: #fff }
    .bv { font-size: 13px; font-weight: bold; color: #fff }
    /* Footer — kept together, never orphaned onto a new page */
    .ft { page-break-inside: avoid; break-inside: avoid; page-break-before: avoid }
    .ty { font-size: 12px; font-weight: bold; color: #000; text-align: center; margin-top: 6px }
    .fl { font-size: 11px; color: #000; text-align: center; margin-top: 2px; word-break: break-word }
    .pl { font-size: 10px; color: #000; text-align: center; margin-top: 5px;
          border-top: 1px solid #000; padding-top: 4px }
    .grn { color: #1a7a3a }

    /* Debug panel — visible on screen, hidden when printing */
    #dbg {
      background: #fef3c7; border: 2px solid #f59e0b; padding: 6px;
      font-size: 9px; font-family: monospace; color: #000;
      margin-bottom: 8px; white-space: pre-wrap; word-break: break-all;
    }
    @media print { #dbg { display: none !important } }
  `

  // ── Debug panel (shows on screen, hidden on print) ────────────────────────
  // This panel is injected into every popup. It populates via inline JS after
  // the page loads. Open the popup window manually before clicking Print to
  // read the measurements, or check the browser console.
  const debugPanel = `
<div id="dbg">⏳ Measuring receipt dimensions…</div>
<script>
  window.addEventListener('load', function() {
    var bsh  = document.body.scrollHeight
    var boh  = document.body.offsetHeight
    var dsh  = document.documentElement.scrollHeight
    var inh  = window.innerHeight
    var inw  = window.innerWidth
    var dpr  = window.devicePixelRatio
    var info = [
      '=== RECEIPT DEBUG ===',
      'body.scrollHeight  : ' + bsh + 'px',
      'body.offsetHeight  : ' + boh + 'px',
      'doc.scrollHeight   : ' + dsh + 'px',
      'window.innerHeight : ' + inh + 'px',
      'window.innerWidth  : ' + inw + 'px',
      'devicePixelRatio   : ' + dpr,
      '',
      'paperWidth (CSS)   : ${w}',
      '@page will use     : ${w} × bsh px  (body.scrollHeight ONLY)',
      '',
      'KEY: bsh (body.scrollHeight) = actual content height → used for @page.',
      'dsh (doc.scrollHeight) is IGNORED — it returns window height, not content.',
      '',
      'EXPECTED: bsh should be 350–550px for a normal receipt.',
      'If bsh ≈ dsh ≈ window.innerHeight → content not rendering in popup.',
    ].join('\\n')
    document.getElementById('dbg').textContent = info
    console.group('[RECEIPT PRINT DEBUG]')
    console.log('body.scrollHeight :', bsh)
    console.log('body.offsetHeight :', boh)
    console.log('doc.scrollHeight  :', dsh)
    console.log('window.innerHeight:', inh)
    console.log('window.innerWidth :', inw)
    console.log('devicePixelRatio  :', dpr)
    console.log('paperWidth        : ${w}')
    console.groupEnd()
  })
<\/script>`

  const L = (cond: unknown, html: string) => cond ? html : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
${debugMode ? debugPanel : '<div id="dbg" style="display:none"></div>'}
${L(settings.show_logo && settings.logo_url, `<img src="${esc(settings.logo_url)}" class="logo" alt="">`)}
${L(settings.show_business_name !== false, `<div class="bn">${esc(mainBn || businessName)}</div>`)}
${L(settings.show_business_name !== false && !!tagline, `<div class="br" style="font-weight:bold;font-size:11px;margin-top:2px;margin-bottom:2px">${esc(tagline)}</div>`)}
${L(settings.show_branch_name && branchName, `<div class="br">${esc(branchName)}</div>`)}
${L(settings.show_address && branchAddress, `<div class="dt">${esc(branchAddress)}</div>`)}
${L(settings.show_phone && branchPhone, `<div class="dt">${esc(branchPhone)}</div>`)}
<hr>
<div class="ino">${esc(invoiceNumber)}</div>
${date.includes(',') 
  ? `<div style="display:flex;justify-content:space-between;margin-bottom:2px">
       <span style="font-size:9px"><span class="lbl">Date</span><span style="font-weight:bold">${esc(date.split(',')[0].trim())}</span></span>
       <span style="font-size:9px"><span class="lbl">Time</span><span style="font-weight:bold">${esc(date.split(',')[1].trim())}</span></span>
     </div>`
  : `<div class="row"><span class="lbl">Date</span><span class="val">${esc(date)}</span></div>`
}
<div class="row"><span class="lbl">Customer</span><span class="val">${esc(customerName)}</span></div>
<div class="row"><span class="lbl">Status</span><span class="val">${esc(status)}</span></div>
<div class="row"><span class="lbl">IMEI/SN</span><span class="val" style="text-align:right;margin-left:8px;word-break:break-all">${esc(deviceImei || 'N/A')}</span></div>
<div class="row"><span class="lbl">Faults</span><span class="val" style="text-align:right;margin-left:8px">${esc(faults || 'N/A')}</span></div>
<hr>
<table class="it">
  <thead><tr>
    <th style="text-align:left">ITEM</th>
    <th class="qt">QTY</th>
    <th class="un">UNIT PRICE</th>
    <th class="dc">DISC</th>
    <th class="am">AMT</th>
  </tr></thead>
  <tbody>
${items.map(i => {
  const manualDisc = i.discount ?? 0
  const hasOriginal = i.original_unit_price != null && i.original_unit_price > i.unit_price
  const saleDisc = hasOriginal ? (i.original_unit_price! - i.unit_price) : 0
  const totalDiscDisplay = saleDisc + manualDisc
  const lineAmt = (i.unit_price - manualDisc) * i.quantity
  
  const unitHtml = hasOriginal 
    ? num(i.original_unit_price!)
    : num(i.unit_price)

  return `  <tr>
    <td class="nm">${esc(i.description)}</td>
    <td class="qt">${i.quantity}</td>
    <td class="un">${unitHtml}</td>
    <td class="dc${totalDiscDisplay > 0 ? ' grn' : ''}">${totalDiscDisplay > 0 ? '-' + num(totalDiscDisplay) : '0'}</td>
    <td class="am">${num(lineAmt)}</td>
  </tr>`
}).join('\n')}
  </tbody>
</table>
<hr>
<div class="tr"><span class="tl">Subtotal</span><span class="tv">${money(subtotal, currency)}</span></div>
<div class="tr"><span class="tl">Discount</span><span class="tv${discount > 0 ? ' grn' : ''}">${discount > 0 ? '-' + money(discount, currency) : money(0, currency)}</span></div>
${L(settings.show_tax_breakdown && tax > 0, `<div class="tr"><span class="tl">Tax</span><span class="tv">${money(tax, currency)}</span></div>`)}
<hr>
<div class="gr"><span class="gl">Total</span><span class="gv">${money(total, currency)}</span></div>
${L(amountPaid > 0, `<div class="tr"><span class="tl">Paid</span><span class="tv grn">${money(amountPaid, currency)}</span></div>`)}
${L(bal > 0, `<div class="bar"><span class="bl">Balance Due</span><span class="bv">${money(bal, currency)}</span></div>`)}
<div class="ft">
  <hr>
  <div class="ty">${esc(thankYou)}</div>
  ${L(settings.footer_address, `<div class="fl">${esc(settings.footer_address)}</div>`)}
  ${footerLines.map(l => `<div class="fl">${esc(l)}</div>`).join('')}
  ${socials.map(s => `<div class="fl">${esc(s.label)}: ${esc(s.val)}</div>`).join('')}
  ${L(settings.policy_text, `<div class="pl">${esc(settings.policy_text)}</div>`)}
</div>
</body></html>`
}

// ─── Open receipt in a new tab ──────────────────────────────────────────────
/** Opens the receipt HTML in a new tab — used by the "Open" button so the user
 *  can view/save/print the exact same document outside the modal.
 *  Pass debugMode=true to also show the on-screen measurement panel + console
 *  logs (body.scrollHeight etc.) for diagnosing thermal-print sizing issues.
 */
export function previewReceiptHtml(data: ReceiptPrintData, debugMode = false): void {
  const html = buildHtml(data, debugMode)
  if (debugMode) {
    console.log('[Receipt Debug] mergedSettings:', JSON.stringify(data.settings, null, 2))
    console.log('[Receipt Debug] thank_you_message:', JSON.stringify(data.settings.thank_you_message))
    console.log('[Receipt Debug] footer_line_1:', data.settings.footer_line_1)
    console.log('[Receipt Debug] items:', data.items)
    console.log('[Receipt Debug] amountPaid:', data.amountPaid, '| total:', data.total)
    console.log('[Receipt Debug] full HTML length:', html.length)
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  window.open(URL.createObjectURL(blob), '_blank')
}


// ─── Auto-print a repair invoice by id ──────────────────────────────────────
// Fetches invoice data the same way RepairInvoiceModal does, then prints it
// without requiring the modal to be open — used to auto-print a receipt right
// after a repair job is created. Fails soft (logs only) so a print/popup
// issue never blocks the caller's success flow.
//
// `preOpenedWin`: pass a window opened synchronously (e.g.
// `window.open('about:blank', '_blank', ...)`) from inside the click handler,
// BEFORE any `await` — same requirement as printReceipt()/openPrintWindow()
// in cart-panel.tsx. Calling this after an await (e.g. once the create-repair
// fetch resolves) is outside the user-gesture window, so the browser silently
// blocks any window.open() at that point; passing a pre-opened window sidesteps
// that entirely, for both the thermal and PDF paths.
const THERMAL_PAPER_SIZES = ['Receipt80', 'Receipt58', 'Custom']

export async function printRepairInvoiceById(repairId: string, preOpenedWin?: Window | null): Promise<void> {
  try {
    const res = await fetch(`/api/repairs/${repairId}/invoice-data`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg = typeof body.error === 'string' ? body.error : (body.error?.message ?? `HTTP ${res.status}`)
      throw new Error(`Invoice data failed: ${msg}`)
    }
    const json = await res.json()
    const data = json.data as ReceiptPrintData

    if (THERMAL_PAPER_SIZES.includes(data.settings.paper_size)) {
      printReceipt(data, preOpenedWin)
      return
    }

    const pdfRes = await fetch(`/api/repairs/${repairId}/pdf`)
    if (!pdfRes.ok) throw new Error(`PDF generation failed (${pdfRes.status})`)
    const blob = await pdfRes.blob()
    const blobUrl = URL.createObjectURL(blob)

    if (preOpenedWin && !preOpenedWin.closed) {
      preOpenedWin.addEventListener('load', () => {
        preOpenedWin.focus()
        preOpenedWin.print()
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
      }, { once: true })
      preOpenedWin.location.href = blobUrl
      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = blobUrl
    document.body.appendChild(iframe)
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        document.body.removeChild(iframe)
        URL.revokeObjectURL(blobUrl)
      }, 60_000)
    }, { once: true })
  } catch (err) {
    console.error('Failed to auto-print repair invoice:', err)
    // Don't close the popup — a window that opens and immediately vanishes
    // looks like nothing happened at all. Show the actual error instead so
    // it's visible/debuggable, and leave closing it to the user.
    if (preOpenedWin && !preOpenedWin.closed) {
      try {
        preOpenedWin.document.open()
        preOpenedWin.document.write(
          `<html><body style="font-family:sans-serif;padding:24px;color:#7f1d1d">` +
          `<h3 style="margin:0 0 8px">Couldn't load the invoice</h3>` +
          `<p style="margin:0;white-space:pre-wrap">${String(err instanceof Error ? err.message : err)}</p>` +
          `</body></html>`
        )
        preOpenedWin.document.close()
      } catch { /* window may already be unreachable — nothing more we can do */ }
    }
  }
}

// ─── Print receipt ─────────────────────────────────────────────────────────────
/**
 * Opens a self-contained print popup for the thermal receipt.
 *
 * ARCHITECTURE:
 * 1. We use a Blob URL (not about:blank) so Chrome does NOT print "about:blank"
 *    as a header on the physical paper.
 * 2. The popup window is sized to exactly the paper width in pixels so the body
 *    is NOT centred in a wider window — that was causing scrollHeight to return
 *    the window height (600px) instead of content height.
 * 3. After the page loads we measure documentElement.scrollHeight (more reliable
 *    than body.scrollHeight when body has padding) and inject
 *    @page { size: Wmm Hpx } so the browser creates exactly ONE page.
 * 4. Everything is console-logged so you can open DevTools on the popup window
 *    (right-click → Inspect) and verify the measurements.
 */
export function printReceipt(data: ReceiptPrintData, preOpenedWin?: Window | null): void {
  const isCustom      = data.settings.paper_size === 'Custom'
  const customW       = data.settings.custom_width  ?? 80
  const customH       = data.settings.custom_height ?? null   // null = roll (measure height)
  const paperWidthCss = data.settings.paper_size === 'Receipt58' ? '58mm'
                      : isCustom ? `${customW}mm`
                      : '80mm'
  // Paper width in screen-pixels at 96 dpi (CSS reference pixels). 1mm = 96/25.4 ≈ 3.7795px
  const mmWidth      = data.settings.paper_size === 'Receipt58' ? 58 : isCustom ? customW : 80
  const paperWidthPx = Math.round(mmWidth * 96 / 25.4)

  const html = buildHtml(data, /* debugMode= */ false)

  let win: Window | null
  let blobUrl: string | null = null

  if (preOpenedWin && !preOpenedWin.closed) {
    // ── Fast path: write HTML directly into the pre-opened window ─────────────
    // The caller opened this window synchronously inside a user-gesture handler
    // (before any await), so it is never blocked by popup blockers.
    // We write the receipt HTML in and close the document stream — the browser
    // treats this as a full page load and fires 'load' normally.
    win = preOpenedWin
    win.document.open()
    win.document.write(html)
    win.document.close()
  } else {
    // ── Fallback: open a new Blob URL popup ────────────────────────────────────
    // This path is used when no pre-opened window is available (e.g. repair invoice
    // modal, or POS when the browser blocked the pre-open). Blob URL avoids Chrome
    // printing "about:blank" as a page header on physical paper.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    blobUrl = URL.createObjectURL(blob)
    win = window.open(
      blobUrl,
      '_blank',
      `width=${paperWidthPx + 4},height=900,toolbar=0,location=0,menubar=0,status=0,scrollbars=1`
    )

    if (!win) {
      alert('Please allow pop-ups for this site to enable printing.')
      URL.revokeObjectURL(blobUrl)
      return
    }
  }

  const doMeasureAndPrint = () => {
    // ── Measure actual content height ────────────────────────────────────────
    // CRITICAL: Use body.scrollHeight ONLY.
    //
    // documentElement.scrollHeight = max(content, viewport) — it returns the
    // WINDOW HEIGHT when content is shorter than the window. Debug data proved:
    //   body.scrollHeight  = 426px  ← actual receipt content (CORRECT)
    //   doc.scrollHeight   = 945px  ← window height (WRONG)
    //   Math.max(426, 945) = 945px  → @page 251mm tall → 138mm blank space printed
    //
    // body.scrollHeight always returns the rendered content height regardless of
    // window size, making it the only reliable measurement here.
    //
    // +80px safety buffer: guards against sub-pixel rounding and footer padding
    // so the last line of the receipt is never clipped by the page boundary.
    const rawHeight     = win!.document.body.scrollHeight
    const contentHeight = rawHeight + 80

    // Log everything so the developer can verify
    console.group('[RECEIPT PRINT] triggerPrint fired')
    console.log('body.scrollHeight (raw)        :', rawHeight, 'px')
    console.log('contentHeight (+80 buffer)     :', contentHeight, 'px  ← used for @page')
    console.log('doc.scrollHeight  (IGNORED)    :', win!.document.documentElement.scrollHeight, 'px  ← window height, do NOT use')
    console.log('window.innerHeight             :', win!.innerHeight, 'px')
    console.log('window.innerWidth              :', win!.innerWidth, 'px')
    console.log('window.devicePixelRatio        :', win!.devicePixelRatio)
    console.log('paperWidthCss                  :', paperWidthCss)

    // ── Inject @page with exact content height + PORTRAIT orientation ────────
    // CRITICAL: Without explicit 'portrait', Windows thermal printer drivers
    // (EPSON TM-T88V, TM-T20III, etc.) auto-rotate 80mm paper to landscape,
    // printing all text sideways from bottom-to-top.
    // 'portrait' forces width < height orientation regardless of driver defaults.
    const pageRule = isCustom && customH
      ? `@page { size: ${paperWidthCss} ${customH}mm portrait; margin: 0; }`
      : `@page { size: ${paperWidthCss} ${contentHeight}px portrait; margin: 0; }`
    console.log('Injecting @page rule           :', pageRule)
    console.groupEnd()

    const sizeStyle = win!.document.createElement('style')
    sizeStyle.id = 'dynamic-page-size'
    sizeStyle.textContent = pageRule
    win!.document.head.appendChild(sizeStyle)

    win!.focus()
    win!.print()

    // ── EPSON timing fix: delayed window close ────────────────────────────────
    // `afterprint` fires the instant the user clicks "Print" in Chrome's dialog.
    // At that moment, the job enters Windows' print spooler but the USB driver
    // (EPSON TM-T88V/VII, TM-T20III, etc.) may not have finished receiving it.
    // Calling win.close() immediately kills the connection mid-transfer → printer
    // receives nothing and outputs no paper.
    //
    // Fix: wait 8 seconds after afterprint before destroying the window.
    // 8s covers even the slowest EPSON USB drivers on Windows 11.
    win!.addEventListener('afterprint', () => {
      console.log('[RECEIPT PRINT] afterprint fired — waiting 8s before closing popup')
      setTimeout(() => {
        win!.close()
        if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
        console.log('[RECEIPT PRINT] popup closed')
      }, 8000)
    }, { once: true })

    // Safety fallback: if afterprint never fires (e.g. user closes dialog without
    // printing), clean up after 60s so we do not leak the blob URL forever.
    setTimeout(() => {
      if (win && !win.closed) win.close()
      if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
    }, 60_000)
  }

  const triggerPrint = () => {
    // Re-measure fallback: if layout hasn't settled (height < 200px), wait
    // another 600ms and try once more before printing.
    const h = win!.document.body.scrollHeight
    if (h < 200) {
      console.log('[RECEIPT PRINT] scrollHeight too small (' + h + 'px) — re-measuring in 600ms')
      setTimeout(doMeasureAndPrint, 600)
    } else {
      doMeasureAndPrint()
    }
  }

  // Wait for the page to fully load, then 1000ms extra for layout reflow.
  // 1000ms (up from 500ms) covers slow EPSON USB drivers that defer font rendering.
  win.addEventListener('load', () => setTimeout(triggerPrint, 1000), { once: true })
}

// ─── Full thermal repair slip (customer receipt) ─────────────────────────────
// Renders a complete receipt slip matching the Laravel blade slip_pdf.blade.php:
// Business header, Date, Ticket ID, Customer, Device, Faults, Charges, Barcode.
export interface SlipPrintData {
  jobNumber: string
  barcodeDataUrl: string
  paperSize?: string
  customWidth?: number | null
  businessName?: string
  branchAddress?: string | null
  branchPhone?: string | null
  customerName?: string
  deviceLabel?: string
  faults?: string[]
  dueDate?: string | null
  createdAt?: string
  totalRepairCharges?: number
  deposit?: number
  remaining?: number
}

function buildSlipHtml(d: SlipPrintData): string {
  const isCustom  = d.paperSize === 'Custom'
  const widthMm   = d.paperSize === 'Receipt58' ? 58 : isCustom ? (d.customWidth ?? 80) : 80
  const w         = `${widthMm}mm`

  // Format date
  const dateStr = d.dueDate
    ? new Date(d.dueDate).toLocaleDateString('en-GB')
    : d.createdAt
    ? new Date(d.createdAt).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB')

  const faults = d.faults ?? []

  const faultBadges = faults.length > 0
    ? faults.map(f => `<span style="display:inline-block;padding:3px 6px;margin:2px;
        background:#1a388d;color:#fff;font-size:10px;border-radius:4px;font-weight:bold;
        -webkit-print-color-adjust:exact;print-color-adjust:exact">${f}</span>`).join('')
    : '<span>No faults recorded</span>'

  const css = `
    @page { margin: 0; size: auto portrait }
    * { box-sizing: border-box; margin: 0; padding: 0 }
    html, body {
      width: ${w};
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 10px 10px 15px 10px }
    .head  { text-align: center; margin-bottom: 4px }
    .bname { font-size: 16px; font-weight: bold; margin-bottom: 2px }
    .addr  { font-size: 10px; color: #000; margin-bottom: 1px }
    hr { border: none; border-top: 2px solid #000; margin: 8px 0 }
    .details { text-align: left; font-size: 12px; margin-bottom: 4px }
    .details div { margin: 3px 0 }
    .summary { border-top: 2px solid #000; padding-top: 8px; font-size: 12px }
    .sumrow { display: flex; justify-content: space-between; border-bottom: 1px solid #000;
              margin: 4px 0; font-weight: 700; padding-bottom: 2px }
    .footer { margin-top: 10px; text-align: center; font-size: 10px; font-weight: 700; line-height: 1.6 }
    .barcode { margin-top: 12px; text-align: center }
    .barcode img { width: 100%; max-width: 220px; height: auto }
  `

  const esc = (s: string | null | undefined) => {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="head">
  <div class="bname">${esc(d.businessName)}</div>
  ${d.branchAddress ? `<div class="addr">${esc(d.branchAddress)}</div>` : ''}
  ${d.branchPhone   ? `<div class="addr">Tel: ${esc(d.branchPhone)}</div>` : ''}
</div>
<hr>
<div class="details">
  <div><strong>Date:</strong> ${dateStr}</div>
  <div><strong>Ticket ID:</strong> T-${esc(d.jobNumber)}</div>
  <div><strong>Customer:</strong> ${esc(d.customerName)}</div>
  <div><strong>Make and Model:</strong> ${esc(d.deviceLabel)}</div>
  <div><strong>Faults:</strong> ${faultBadges}</div>
</div>
<div class="summary">
  <div class="sumrow"><span>Repair Charges:</span><span>£${(d.totalRepairCharges ?? 0).toFixed(2)}</span></div>
  <div class="sumrow"><span>Deposit:</span><span>£${(d.deposit ?? 0).toFixed(2)}</span></div>
  <div class="sumrow"><span>Remaining:</span><span>£${(d.remaining ?? 0).toFixed(2)}</span></div>
</div>
<div class="footer">
  <p>Refund &amp; Exchange within 28 Days<br>and with Proof of Purchase only.</p>
</div>
<div class="barcode"><img src="${d.barcodeDataUrl}" alt="Barcode"></div>
</body></html>`
}

/** Opens the slip HTML in a new tab for preview/print. */
export function previewSlipHtml(data: SlipPrintData): void {
  const html = buildSlipHtml(data)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  window.open(URL.createObjectURL(blob), '_blank')
}

export function printSlip(
  data: SlipPrintData,
  preOpenedWin?: Window | null
): void {
  const isCustom      = data.paperSize === 'Custom'
  const mmWidth       = data.paperSize === 'Receipt58' ? 58 : isCustom ? (data.customWidth ?? 80) : 80
  const paperWidthCss = `${mmWidth}mm`
  const paperWidthPx  = Math.round(mmWidth * 96 / 25.4)

  const html = buildSlipHtml(data)

  let win: Window | null
  let blobUrl: string | null = null

  if (preOpenedWin && !preOpenedWin.closed) {
    win = preOpenedWin
    win.document.open()
    win.document.write(html)
    win.document.close()
  } else {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    blobUrl = URL.createObjectURL(blob)
    win = window.open(
      blobUrl,
      '_blank',
      `width=${paperWidthPx + 4},height=700,toolbar=0,location=0,menubar=0,status=0,scrollbars=1`
    )
    if (!win) {
      alert('Please allow pop-ups for this site to enable printing.')
      URL.revokeObjectURL(blobUrl)
      return
    }
  }

  const doMeasureAndPrint = () => {
    const contentHeight = win!.document.body.scrollHeight + 60
    // CRITICAL: 'portrait' prevents Windows thermal drivers from auto-rotating
    // 80mm paper to landscape (which prints text sideways bottom-to-top).
    const pageRule = `@page { size: ${paperWidthCss} ${contentHeight}px portrait; margin: 0; }`

    const sizeStyle = win!.document.createElement('style')
    sizeStyle.id = 'dynamic-page-size'
    sizeStyle.textContent = pageRule
    win!.document.head.appendChild(sizeStyle)

    win!.focus()
    win!.print()

    win!.addEventListener('afterprint', () => {
      setTimeout(() => {
        win!.close()
        if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
      }, 8000)
    }, { once: true })

    setTimeout(() => {
      if (win && !win.closed) win.close()
      if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
    }, 60_000)
  }

  win.addEventListener('load', () => setTimeout(doMeasureAndPrint, 1000), { once: true })
}

