import type { InvoiceSettings, SocialLinks, FooterLineScope } from '@/types/invoice-settings'
import { formatCurrency } from '@/lib/utils'

// Full names used for the side-by-side social header row on the receipt
// (e.g. "Instagram   TikTok" with handles below).
const SOCIAL_LABELS_FULL: Record<keyof SocialLinks, string> = {
  website: 'Website', facebook: 'Facebook', instagram: 'Instagram',
  twitter: 'Twitter', whatsapp: 'WhatsApp', landline: 'Landline', tiktok: 'TikTok',
}

// Small monochrome icon markup (uses currentColor so it prints black),
// shown next to each platform name in the social grid.
const SOCIAL_ICONS: Record<keyof SocialLinks, string> = {
  website: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.36a9.85 9.85 0 0 0 4.62 1.17h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.64-1.03-5.13-2.9-7C17.17 3.03 14.68 2 12.04 2zm5.86 14.11c-.25.7-1.45 1.34-2 1.43-.5.08-1.14.11-1.84-.12-.42-.14-.96-.31-1.65-.61-2.9-1.26-4.8-4.17-4.94-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.77-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.66-.15.27.1 1.72.81 2.02.96.3.15.5.22.57.35.07.13.07.75-.18 1.45z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/></svg>',
  landline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
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
  dueAt?: string | null
  businessName: string
  branchName?: string | null
  branchAddress?: string | null
  branchPhone?: string | null
  customerName: string
  deviceName?: string
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
    settings, invoiceNumber, status, issuedAt, dueAt,
    businessName, branchName, branchAddress, branchPhone, customerName, deviceName, deviceImei, faults,
    items, subtotal, discount = 0, tax = 0, total, amountPaid = 0, currency = 'GBP',
  } = d

  const pc       = settings.primary_color ?? '#0f766e'
  const bal      = Math.max(0, total - amountPaid)
  const w        = settings.paper_size === 'Receipt58' ? '58mm'
                 : settings.paper_size === 'Custom'    ? `${settings.custom_width ?? 80}mm`
                 : '80mm'
  const date     = new Date(issuedAt).toLocaleDateString('en-GB')
  const thankYou = settings.thank_you_message || 'Thank you for your business!'

  // Repair jobs pass device/IMEI/fault info; POS sales never do — this is the
  // existing signal (already used below for the Order Detail box) reused here
  // to scope which footer lines print on which receipt type.
  const isRepairReceipt = deviceName !== undefined || deviceImei !== undefined || faults !== undefined

  const bnParts = (businessName || '').split('|')
  const mainBn = bnParts[0].trim()
  const tagline = bnParts.length > 1 ? bnParts[1].trim() : null

  const socials = Object.entries(settings.social_links ?? {})
    .filter(([, v]) => !!v)
    .map(([k, v]) => ({
      label: SOCIAL_LABELS_FULL[k as keyof SocialLinks],
      icon: SOCIAL_ICONS[k as keyof SocialLinks],
      val: String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    }))

  const footerLineDefs: Array<{ line: string | null; scope: FooterLineScope | undefined }> = [
    { line: settings.footer_line_1, scope: settings.footer_line_1_scope },
    { line: settings.footer_line_2, scope: settings.footer_line_2_scope },
    { line: settings.footer_line_3, scope: settings.footer_line_3_scope },
  ]
  const footerLines = footerLineDefs
    .filter(({ line, scope }) => {
      if (!line || line === settings.thank_you_message) return false
      const effectiveScope = scope ?? 'both'
      return effectiveScope === 'both' || effectiveScope === (isRepairReceipt ? 'repair' : 'pos')
    })
    .map(({ line }) => line as string)

  const policyScope = settings.policy_text_scope ?? 'both'
  const showPolicyText = !!settings.policy_text
    && (policyScope === 'both' || policyScope === (isRepairReceipt ? 'repair' : 'pos'))

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
      font-weight: 700;
      line-height: 1.35;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Thermal print heads render thin (normal-weight) strokes as faint/grey —
       bold is the fix, so every element defaults to bold via inheritance
       above and nothing in this file overrides it back down to normal. */
    body { padding: 10px 10px 20px 10px }
    .c  { text-align: center }
    .logo { display: block; margin: 0 auto 5px; width: 64px; height: 64px; object-fit: contain }
    .bn { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 2px }
    .since { font-size: 11px; font-weight: bold; color: #000; text-align: center; margin-bottom: 2px }
    .br { font-size: 11px; color: #000; text-align: center; margin-bottom: 2px }
    .dt { font-size: 11px; color: #000; text-align: center; margin-bottom: 2px }
    hr  { border: none; border-top: 1px dashed #000; margin: 7px 0 }
    .ino { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 3px }
    .row { display: flex; justify-content: space-between; margin-bottom: 5px }
    .lbl { font-size: 11px; color: #000; font-weight: 700 }
    .val { font-size: 11px; font-weight: bold; color: #000 }
    /* ── Item rows (single line per item, no per-item pricing columns) ── */
    .irow { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px }
    .ival { font-size: 11px; font-weight: bold; color: #000; text-align: right; max-width: 65%; word-break: break-word }
    .itm { display: flex; justify-content: space-between; margin-bottom: 5px }
    .itv { font-size: 11px; font-weight: bold; color: #000; text-align: right; max-width: 65% }
    .tr  { display: flex; justify-content: space-between; margin-bottom: 5px }
    .tl  { font-size: 11px; color: #000; font-weight: 700 }
    .tv  { font-size: 11px; font-weight: bold; color: #000 }
    .gr  { display: flex; justify-content: space-between; margin-top: 8px }
    .gl  { font-size: 15px; font-weight: bold; color: #000 }
    .gv  { font-size: 15px; font-weight: bold; color: #000 }
    .bar {
      display: flex; justify-content: space-between;
      background: #000; padding: 9px; border-radius: 3px; margin-top: 8px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact
    }
    .bl { font-size: 13px; font-weight: bold; color: #fff }
    .bv { font-size: 13px; font-weight: bold; color: #fff }
    /* Footer — kept together, never orphaned onto a new page */
    .ft { page-break-inside: avoid; break-inside: avoid; page-break-before: avoid }
    .ty { font-size: 13px; font-weight: bold; color: #000; text-align: center; margin-top: 9px }
    .gt { font-size: 12px; font-weight: bold; color: #000; text-align: center; margin-top: 6px }
    .fl { font-size: 12px; color: #000; text-align: center; margin-top: 5px; word-break: break-word; white-space: pre-line }
    .lh { font-size: 10px; font-weight: 700; color: #000; text-align: center; letter-spacing: 0.5px; margin-top: 7px }
    .hr2 { border: none; border-top: 2px solid #000; margin: 10px 0 }
    .pl { font-size: 10px; color: #000; text-align: center; margin-top: 8px;
          border-top: 1px solid #000; padding-top: 6px; white-space: pre-line }
    .grn { color: #1a7a3a }
    /* ── Social grid: fixed 2 columns so pairing never shifts with content length ── */
    .soc { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; margin-top: 7px }
    .socc { text-align: center }
    .socl { display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 10px; font-weight: 700; color: #000 }
    .socv { font-size: 10px; color: #000; word-break: break-word }

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
${L(settings.since_year, `<div class="since">Since ${esc(settings.since_year)}</div>`)}
${L(settings.show_business_name !== false && !!tagline, `<div class="br" style="font-weight:bold;font-size:11px;margin-top:2px;margin-bottom:2px">${esc(tagline)}</div>`)}
${L(settings.show_branch_name && branchName, `<div class="br">${esc(branchName)}</div>`)}
${L(settings.show_address && branchAddress, `<div class="dt">${esc(branchAddress)}</div>`)}
${L(settings.show_phone && branchPhone, `<div class="dt">${esc(branchPhone)}</div>`)}
<hr>
<div class="ino">${esc(invoiceNumber)}</div>
${date.includes(',')
  ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px">
       <span style="font-size:9px"><span class="lbl">Date</span><span style="font-weight:bold">${esc(date.split(',')[0].trim())}</span></span>
       <span style="font-size:9px"><span class="lbl">Time</span><span style="font-weight:bold">${esc(date.split(',')[1].trim())}</span></span>
     </div>`
  : ''
}
<hr>
${isRepairReceipt ? `
<div class="row"><span class="lbl">Order No.</span><span class="val">${esc(invoiceNumber)}</span></div>
<div class="row"><span class="lbl">Order Date</span><span class="val">${new Date(issuedAt).toLocaleDateString('en-GB')}</span></div>
${dueAt ? `<div class="row"><span class="lbl">Due Date</span><span class="val">${new Date(dueAt).toLocaleDateString('en-GB')}</span></div>` : ''}
` : `
<div class="row"><span class="lbl">Date</span><span class="val">${new Date(issuedAt).toLocaleDateString('en-GB')}</span></div>
`}
<div class="row"><span class="lbl">Customer</span><span class="val">${esc(customerName)}</span></div>
<div class="row"><span class="lbl">Status</span><span class="val">${esc(status)}</span></div>

${isRepairReceipt ? `
<div style="margin-top:8px; border:1px solid #000;">
  <div style="text-align:center; font-weight:bold; border-bottom:1px solid #000; padding:4px 0; font-size:11px; background-color:#f9f9f9;">
    Order Detail
  </div>
  <div style="padding:6px;">
    ${deviceName ? `<div style="margin-bottom:4px; font-weight:bold; font-size:11px; text-transform:uppercase;">${esc(deviceName)}</div>` : ''}
    <div style="margin-bottom:4px;"><span class="lbl">Serial No.: </span><span style="font-weight:bold; word-break:break-all;">${esc(deviceImei || 'N/A')}</span></div>
    <div style="margin-bottom:6px;"><span class="lbl">Faults: </span><span style="font-weight:bold;">${esc(faults || 'N/A')}</span></div>

    <div style="border-bottom:1px dashed #000; margin:6px 0;"></div>

    ${items.map(i => {
      const gross = i.quantity * i.unit_price
      const itemDiscount = i.discount ?? 0
      const net = gross - itemDiscount
      return `
    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
      <span style="font-weight:bold; font-size:11px; flex:1; padding-right:8px; word-break:break-word;">${esc(i.description)}</span>
      <span style="font-size:11px; text-align:right;">${itemDiscount > 0 ? `<span style="text-decoration:line-through; color:#888; font-weight:normal; margin-right:4px;">${money(gross, currency)}</span>` : ''}<span style="font-weight:bold;">${money(net, currency)}</span></span>
    </div>
    `
    }).join('')}
    <div style="border-bottom:1px dashed #000; margin:6px 0;"></div>
    <div class="tr"><span class="tl">Discount</span><span class="tv">${discount > 0 ? '-' + money(discount, currency) : money(0, currency)}</span></div>
    <div class="tr"><span class="tl">Subtotal</span><span class="tv">${money(subtotal, currency)}</span></div>
    ${L(settings.show_tax_breakdown && tax > 0, `<div class="tr"><span class="tl">Tax</span><span class="tv">${money(tax, currency)}</span></div>`)}
    <hr>
    <div class="gr"><span class="gl">Total Charges</span><span class="gv">${money(total, currency)}</span></div>
    <div class="tr"><span class="tl">Deposit / Paid</span><span class="tv">${money(amountPaid, currency)}</span></div>
    ${L(bal > 0, `<div class="bar"><span class="bl">Remaining</span><span class="bv">${money(bal, currency)}</span></div>`)}
  </div>
</div>
` : `
<hr>
${items.map(i => {
  const gross = i.quantity * i.unit_price
  const itemDiscount = i.discount ?? 0
  const net = gross - itemDiscount
  return `
<div style="display:flex; justify-content:space-between; margin-bottom:5px;">
  <span style="font-weight:bold; font-size:11px; flex:1; padding-right:8px; word-break:break-word;">${i.quantity > 1 ? i.quantity + 'x ' : ''}${esc(i.description)}</span>
  <span style="font-size:11px; text-align:right;">${itemDiscount > 0 ? `<span style="text-decoration:line-through; color:#888; font-weight:normal; margin-right:4px;">${money(gross, currency)}</span>` : ''}<span style="font-weight:bold;">${money(net, currency)}</span></span>
</div>
`
}).join('')}
<hr>
<div class="tr"><span class="tl">Discount</span><span class="tv">${discount > 0 ? '-' + money(discount, currency) : money(0, currency)}</span></div>
<div class="tr"><span class="tl">Subtotal</span><span class="tv">${money(subtotal, currency)}</span></div>
${L(settings.show_tax_breakdown && tax > 0, `<div class="tr"><span class="tl">Tax</span><span class="tv">${money(tax, currency)}</span></div>`)}
<hr>
<div class="gr"><span class="gl">Total Charges</span><span class="gv">${money(total, currency)}</span></div>
<div class="tr"><span class="tl">Amount Paid</span><span class="tv">${money(amountPaid, currency)}</span></div>
${L(bal > 0, `<div class="bar"><span class="bl">Balance Due</span><span class="bv">${money(bal, currency)}</span></div>`)}
`}
<div class="ft">
  <hr>
  <div class="ty">${esc(thankYou)}</div>
  ${L(settings.guarantee_line_1, `<div class="gt">• ${esc(settings.guarantee_line_1)}</div>`)}
  ${L(settings.guarantee_line_2, `<div class="gt">• ${esc(settings.guarantee_line_2)}</div>`)}
  ${footerLines.map(l => `<div class="fl">${esc(l)}</div>`).join('')}
  ${L(settings.footer_address, `<hr><div class="lh">ADDRESS</div><div class="fl">${esc(settings.footer_address)}</div>`)}
  ${L(settings.footer_phone, `<hr><div class="lh">PH</div><div class="fl">${esc(settings.footer_phone)}</div>`)}
  ${L(socials.length > 0, `<hr class="hr2"><div class="soc">${socials.map(s => `<div class="socc"><div class="socl">${s.icon}<span>${esc(s.label)}</span></div><div class="socv">${esc(s.val)}</div></div>`).join('')}</div>`)}
  ${L(showPolicyText, `<div class="pl">${esc(settings.policy_text)}</div>`)}
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
      line-height: 1.35;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 10px 10px 15px 10px }
    .head  { text-align: center; margin-bottom: 6px }
    .bname { font-size: 16px; font-weight: bold; margin-bottom: 4px }
    .addr  { font-size: 10px; color: #000; margin-bottom: 3px }
    hr { border: none; border-top: 2px solid #000; margin: 10px 0 }
    .details { text-align: left; font-size: 12px; margin-bottom: 6px }
    .details div { margin: 5px 0 }
    .summary { border-top: 2px solid #000; padding-top: 10px; font-size: 12px }
    .sumrow { display: flex; justify-content: space-between; border-bottom: 1px solid #000;
              margin: 6px 0; font-weight: 700; padding-bottom: 4px }
    .footer { margin-top: 12px; text-align: center; font-size: 10px; font-weight: 700; line-height: 1.6 }
    .barcode { margin-top: 14px; text-align: center }
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

