import type { InvoiceSettings, SocialLinks } from '@/types/invoice-settings'

const SOCIAL_LABELS: Record<keyof SocialLinks, string> = {
  website: 'Web', facebook: 'FB', instagram: 'IG',
  twitter: 'TW', whatsapp: 'WA', tiktok: 'TT',
}

function money(n: number, currency = 'GBP') {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  return `${sym}${n.toFixed(2)}`
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

function buildHtml(d: ReceiptPrintData): string {
  const {
    settings, invoiceNumber, status, issuedAt,
    businessName, branchName, branchAddress, branchPhone, customerName,
    items, subtotal, discount = 0, tax = 0, total, amountPaid = 0, currency = 'GBP',
  } = d

  const pc       = settings.primary_color ?? '#0f766e'
  const bal      = Math.max(0, total - amountPaid)
  const w        = settings.paper_size === 'Receipt58' ? '58mm' : '80mm'
  const date     = new Date(issuedAt).toLocaleDateString('en-GB')
  const thankYou = settings.thank_you_message || 'Thank you for your business!'

  const socials = Object.entries(settings.social_links ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => ({
      label: SOCIAL_LABELS[k as keyof SocialLinks],
      val: String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    }))

  const footerLines = [settings.footer_line_1, settings.footer_line_2, settings.footer_line_3]
    .filter((l): l is string => !!l && l !== settings.thank_you_message)

  const css = `
    /* 
     * size: ${w} — no height keyword so the browser uses natural content height.
     * DO NOT add 'auto' here — that defers to the printer's paper height (e.g. 297mm)
     * which clips the footer on long receipts.
     */
    @page { size: ${w}; margin: 0 }
    *     { box-sizing: border-box; margin: 0; padding: 0 }
    body  { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #000;
            background: #fff; padding: 10px 10px 30px 10px; width: ${w};
            -webkit-print-color-adjust: exact; print-color-adjust: exact }
    .c    { text-align: center }
    .logo { display: block; margin: 0 auto 6px; width: 48px; height: 48px; object-fit: contain }
    .bn   { font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 1px }
    .br   { font-size: 8px; color: #6b7280; text-align: center; margin-bottom: 1px }
    .dt   { font-size: 7.5px; color: #6b7280; text-align: center; margin-bottom: 1px }
    hr    { border: none; border-top: 1px dashed #9ca3af; margin: 6px 0 }
    .ino  { font-size: 9px; font-weight: bold; text-align: center; margin-bottom: 2px }
    .row  { display: flex; justify-content: space-between; margin-bottom: 2px }
    .lbl  { font-size: 7.5px; color: #6b7280 }
    .val  { font-size: 7.5px; font-weight: bold }
    .ir   { display: flex; align-items: flex-start; margin-bottom: 4px }
    .id   { flex: 1; padding-right: 4px; font-size: 8px; word-break: break-word }
    .ia   { font-size: 8px; text-align: right; width: 52px; flex-shrink: 0 }
    .tr   { display: flex; justify-content: space-between; margin-bottom: 1.5px }
    .tl   { font-size: 8px; color: #6b7280 }
    .tv   { font-size: 8px }
    .gr   { display: flex; justify-content: space-between; margin-top: 3px }
    .gl   { font-size: 11px; font-weight: bold }
    .gv   { font-size: 11px; font-weight: bold; color: ${pc} }
    .bar  { display: flex; justify-content: space-between; background: ${pc}; padding: 6px;
            border-radius: 3px; margin-top: 4px;
            -webkit-print-color-adjust: exact; print-color-adjust: exact }
    .bl   { font-size: 9px; font-weight: bold; color: #fff }
    .bv   { font-size: 9px; font-weight: bold; color: #fff }
    /* Keep footer block together — prevents browser from orphaning it across a phantom page boundary */
    .ft   { page-break-inside: avoid; break-inside: avoid; page-break-before: avoid }
    .ty   { font-size: 8px; font-weight: bold; color: ${pc}; text-align: center; margin-top: 6px }
    .fl   { font-size: 7px; color: #6b7280; text-align: center; margin-top: 1.5px; word-break: break-word }
    .pl   { font-size: 6px; color: #9ca3af; text-align: center; margin-top: 5px;
            border-top: 0.5px solid #e5e7eb; padding-top: 4px }
    .grn  { color: #10b981 }
  `

  const L = (cond: unknown, html: string) => cond ? html : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
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

/** DEBUG: open receipt HTML in a new tab without printing so you can inspect the full output */
export function previewReceiptHtml(data: ReceiptPrintData): void {
  const html = buildHtml(data)
  console.log('[Receipt Debug] mergedSettings:', JSON.stringify(data.settings, null, 2))
  console.log('[Receipt Debug] thank_you_message:', JSON.stringify(data.settings.thank_you_message))
  console.log('[Receipt Debug] footer_line_1:', data.settings.footer_line_1)
  console.log('[Receipt Debug] items:', data.items)
  console.log('[Receipt Debug] amountPaid:', data.amountPaid, '| total:', data.total)
  console.log('[Receipt Debug] full HTML length:', html.length)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  window.open(URL.createObjectURL(blob), '_blank')
}

/**
 * Opens a self-contained print window with the receipt HTML, triggers print,
 * then closes the window. Works independently of any app CSS or layout.
 *
 * KEY: After the popup renders, we measure its actual body.scrollHeight and
 * inject a precise @page { size: Wmm Hpx } so the browser creates exactly ONE
 * page that matches the content height — no more 2-page splits at 297mm.
 */
export function printReceipt(data: ReceiptPrintData): void {
  const html = buildHtml(data)
  const paperWidth = data.settings.paper_size === 'Receipt58' ? '58mm' : '80mm'

  // Open a small blank window (not a tab) so it auto-closes cleanly after print
  const win = window.open('', '_blank', 'width=420,height=600,toolbar=0,location=0,menubar=0,status=0,scrollbars=1')
  if (!win) {
    // Popup blocked — fall back to blob URL which browsers open as a tab
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const tab  = window.open(url, '_blank')
    // Clean up the object URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    if (!tab) alert('Please allow pop-ups for this site to enable printing.')
    return
  }

  win.document.open()
  win.document.write(html)
  win.document.close()

  const triggerPrint = () => {
    // ── Dynamic page-height injection ─────────────────────────────────────────
    // Measure how tall the rendered receipt actually is, then set @page size to
    // exactly that height. This eliminates the 2-page split that happens when
    // the browser uses the printer's paper height (e.g. 297mm) as the page boundary.
    const bodyHeight = win.document.body.scrollHeight
    const sizeStyle  = win.document.createElement('style')
    sizeStyle.textContent = `@page { size: ${paperWidth} ${bodyHeight}px; margin: 0; }`
    win.document.head.appendChild(sizeStyle)
    // ──────────────────────────────────────────────────────────────────────────

    win.focus()
    win.print()
    // Close only AFTER the browser has finished sending data to the printer.
    // Closing before afterprint fires truncates the print job mid-page.
    win.addEventListener('afterprint', () => win.close(), { once: true })
  }

  // Wait for full load (images included) then give the layout engine extra time
  // to finish rendering all content (especially the footer) before the print dialog.
  // 400ms is intentionally larger than 250ms to guarantee the footer is painted.
  if (win.document.readyState === 'complete') {
    setTimeout(triggerPrint, 400)
  } else {
    win.addEventListener('load', () => setTimeout(triggerPrint, 400), { once: true })
  }
}
