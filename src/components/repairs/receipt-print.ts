import type { InvoiceSettings, SocialLinks } from '@/types/invoice-settings'
import { formatCurrency } from '@/lib/utils'

const SOCIAL_LABELS: Record<keyof SocialLinks, string> = {
  website: 'Web', facebook: 'FB', instagram: 'IG',
  twitter: 'TW', whatsapp: 'WA', tiktok: 'TT',
}

function money(n: number, currency?: string) {
  return formatCurrency(n, currency)
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
  items: Array<{ description: string; quantity: number; unit_price: number }>
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
    businessName, branchName, branchAddress, branchPhone, customerName,
    items, subtotal, discount = 0, tax = 0, total, amountPaid = 0, currency = 'GBP',
  } = d

  const pc       = settings.primary_color ?? '#0f766e'
  const bal      = Math.max(0, total - amountPaid)
  const w        = settings.paper_size === 'Receipt58' ? '58mm'
                 : settings.paper_size === 'Custom'    ? `${settings.custom_width ?? 80}mm`
                 : '80mm'
  const date     = new Date(issuedAt).toLocaleDateString('en-GB')
  const thankYou = settings.thank_you_message || 'Thank you for your business!'

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
  const css = `
    @page { margin: 0 }
    * { box-sizing: border-box; margin: 0; padding: 0 }
    html, body {
      width: ${w};
      /* No min-height / height — let content define the height */
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8px;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 10px 10px 20px 10px }
    .c  { text-align: center }
    .logo { display: block; margin: 0 auto 6px; width: 48px; height: 48px; object-fit: contain }
    .bn { font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 1px }
    .br { font-size: 8px;  color: #555; text-align: center; margin-bottom: 1px }
    .dt { font-size: 7.5px; color: #555; text-align: center; margin-bottom: 1px }
    hr  { border: none; border-top: 1px dashed #9ca3af; margin: 6px 0 }
    .ino { font-size: 9px; font-weight: bold; text-align: center; margin-bottom: 2px }
    .row { display: flex; justify-content: space-between; margin-bottom: 2px }
    .lbl { font-size: 7.5px; color: #555 }
    .val { font-size: 7.5px; font-weight: bold }
    .ir  { display: flex; align-items: flex-start; margin-bottom: 4px }
    .id  { flex: 1; padding-right: 4px; font-size: 8px; word-break: break-word }
    .ia  { font-size: 8px; text-align: right; width: 52px; flex-shrink: 0 }
    .tr  { display: flex; justify-content: space-between; margin-bottom: 1.5px }
    .tl  { font-size: 8px; color: #555 }
    .tv  { font-size: 8px }
    .gr  { display: flex; justify-content: space-between; margin-top: 3px }
    .gl  { font-size: 11px; font-weight: bold }
    .gv  { font-size: 11px; font-weight: bold; color: ${pc} }
    .bar {
      display: flex; justify-content: space-between;
      background: ${pc}; padding: 6px; border-radius: 3px; margin-top: 4px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact
    }
    .bl { font-size: 9px; font-weight: bold; color: #fff }
    .bv { font-size: 9px; font-weight: bold; color: #fff }
    /* Footer — kept together, never orphaned onto a new page */
    .ft { page-break-inside: avoid; break-inside: avoid; page-break-before: avoid }
    .ty { font-size: 9px; font-weight: bold; color: #000; text-align: center; margin-top: 6px }
    .fl { font-size: 7.5px; color: #374151; text-align: center; margin-top: 2px; word-break: break-word }
    .pl { font-size: 6.5px; color: #374151; text-align: center; margin-top: 5px;
          border-top: 0.5px solid #e5e7eb; padding-top: 4px }
    .grn { color: #10b981 }

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
${L(settings.show_business_name !== false, `<div class="bn">${esc(businessName)}</div>`)}
${L(settings.show_branch_name && branchName, `<div class="br">${esc(branchName)}</div>`)}
${L(settings.show_address && branchAddress, `<div class="dt">${esc(branchAddress)}</div>`)}
${L(settings.show_phone && branchPhone, `<div class="dt">${esc(branchPhone)}</div>`)}
<hr>
<div class="ino">${esc(invoiceNumber)}</div>
<div class="row"><span class="lbl">Date</span><span class="val">${esc(date)}</span></div>
<div class="row"><span class="lbl">Customer</span><span class="val">${esc(customerName)}</span></div>
<div class="row"><span class="lbl">Status</span><span class="val">${esc(status)}</span></div>
<hr>
${items.map(i => `<div class="ir"><div class="id">${esc(i.description)}</div><div class="ia">${money(i.quantity * i.unit_price, currency)}</div></div>`).join('')}
<hr>
<div class="tr"><span class="tl">Subtotal</span><span class="tv">${money(subtotal, currency)}</span></div>
${L(discount > 0, `<div class="tr"><span class="tl">Discount</span><span class="tv grn">-${money(discount, currency)}</span></div>`)}
${L(settings.show_tax_breakdown && tax > 0, `<div class="tr"><span class="tl">Tax</span><span class="tv">${money(tax, currency)}</span></div>`)}
<hr>
<div class="gr"><span class="gl">Total</span><span class="gv">${money(total, currency)}</span></div>
${L(amountPaid > 0, `<div class="tr"><span class="tl">Paid</span><span class="tv grn">${money(amountPaid, currency)}</span></div>`)}
${L(bal > 0, `<div class="bar"><span class="bl">Balance Due</span><span class="bv">${money(bal, currency)}</span></div>`)}
<div class="ft">
  <hr>
  <div class="ty">${esc(thankYou)}</div>
  ${footerLines.map(l => `<div class="fl">${esc(l)}</div>`).join('')}
  ${socials.map(s => `<div class="fl">${esc(s.label)}: ${esc(s.val)}</div>`).join('')}
  ${L(settings.policy_text, `<div class="pl">${esc(settings.policy_text)}</div>`)}
</div>
</body></html>`
}

// ─── Debug preview (opens receipt in new tab with measurements visible) ───────
/** Opens receipt HTML in a new tab with on-screen debug panel + console logs.
 *  Use the "Debug HTML" button in the invoice modal to call this.
 *  READ the yellow debug panel to see body.scrollHeight and other measurements.
 */
export function previewReceiptHtml(data: ReceiptPrintData): void {
  const html = buildHtml(data, /* debugMode= */ true)
  console.log('[Receipt Debug] mergedSettings:', JSON.stringify(data.settings, null, 2))
  console.log('[Receipt Debug] thank_you_message:', JSON.stringify(data.settings.thank_you_message))
  console.log('[Receipt Debug] footer_line_1:', data.settings.footer_line_1)
  console.log('[Receipt Debug] items:', data.items)
  console.log('[Receipt Debug] amountPaid:', data.amountPaid, '| total:', data.total)
  console.log('[Receipt Debug] full HTML length:', html.length)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  window.open(URL.createObjectURL(blob), '_blank')
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

    // ── Inject @page with exact content height ───────────────────────────────
    // For Custom paper with a defined height (e.g. 80×210mm) use the fixed mm
    // dimension so the page is always exactly that size regardless of content.
    // For thermal rolls (Receipt80/Receipt58/Custom without height) measure the
    // actual content so the page is exactly as tall as the receipt — no blank tail.
    const pageRule = isCustom && customH
      ? `@page { size: ${paperWidthCss} ${customH}mm; margin: 0; }`
      : `@page { size: ${paperWidthCss} ${contentHeight}px; margin: 0; }`
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

