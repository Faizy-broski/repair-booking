'use client'
import { useState } from 'react'
import { Copy, CheckCheck, Search, Tag, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { PageHeader } from '@/components/shared/page-header'

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative rounded-xl bg-gray-900 p-4">
      <button
        onClick={copy}
        className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-600"
      >
        {copied ? <CheckCheck className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="overflow-x-auto text-xs text-green-400 whitespace-pre-wrap pr-16">{code}</pre>
    </div>
  )
}

export default function WidgetsPage() {
  const { activeBranch, profile } = useAuthStore()
  const subdomain = typeof window !== 'undefined'
    ? window.location.hostname.split('.')[0]
    : 'your-subdomain'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'

  const trackerEmbed = `<!-- Repair Tracker Widget -->
<div id="repair-tracker-widget"></div>
<script>
  (function() {
    var w = document.createElement('iframe');
    w.src = '${appUrl}/widget/tracker?subdomain=${subdomain}';
    w.style.cssText = 'width:100%;height:400px;border:none;border-radius:12px;';
    w.title = 'Repair Status Tracker';
    document.getElementById('repair-tracker-widget').appendChild(w);
  })();
</script>`

  const priceCalcEmbed = `<!-- Price Calculator Widget -->
<div id="price-calc-widget"></div>
<script>
  (function() {
    var w = document.createElement('iframe');
    w.src = '${appUrl}/widget/prices?subdomain=${subdomain}';
    w.style.cssText = 'width:100%;height:500px;border:none;border-radius:12px;';
    w.title = 'Repair Price Calculator';
    document.getElementById('price-calc-widget').appendChild(w);
  })();
</script>`

  const directApiTracker = `// Direct API — Repair Tracker
fetch('${appUrl}/api/public/ticket-status?ticket_number=TEC-00001&phone=07700000000&subdomain=${subdomain}')
  .then(r => r.json())
  .then(data => console.log(data.data))

// Response shape:
// {
//   ticket_number:"TEC-00001",
//   status:"repaired",
//   status_label:"Ready for Collection",
//   device:"Apple iPhone 15",
//   issue:"Screen replacement",
//   created_at:"...",
//   updated_at:"...",
//   store_name:"TechFix"
// }`

  const directApiPrices = `// Direct API — Service Prices
fetch('${appUrl}/api/public/service-prices?subdomain=${subdomain}')
  .then(r => r.json())
  .then(data => console.log(data.data))

// Response shape:
// {
//   business: { name:"TechFix", currency:"GBP" },
//   categories: [...],
//   problems: [
//     { id, name, price, warranty_days, device, category },
//     ...
//   ]
// }`

  const bookingEmbed = `<!-- Online Booking Widget -->
<div id="booking-widget"></div>
<script>
  (function() {
    var w = document.createElement('iframe');
    w.src = '${appUrl}/widget/booking?subdomain=${subdomain}';
    w.style.cssText = 'width:100%;height:600px;border:none;border-radius:12px;';
    w.title = 'Book an Appointment';
    document.getElementById('booking-widget').appendChild(w);
  })();
</script>`

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Embeddable Widgets"
        description={
          <>
            Add these widgets to your website so customers can track repairs and get instant prices.
            Your subdomain: <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-mono text-primary">{subdomain}</code>
          </>
        }
      />

      {/* Repair Tracker */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <Search className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Repair Status Tracker</h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">Customers enter their ticket number + phone to check repair status</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface">Embed Code (iframe)</p>
          <CodeBlock code={trackerEmbed} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface">Direct API</p>
          <CodeBlock code={directApiTracker} />
        </div>
      </div>

      {/* Price Calculator */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <Tag className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Price Calculator</h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">Customers browse your service catalogue and get instant repair prices</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface">Embed Code (iframe)</p>
          <CodeBlock code={priceCalcEmbed} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface">Direct API</p>
          <CodeBlock code={directApiPrices} />
        </div>
      </div>

      {/* Online Booking */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Online Booking</h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">Let customers book appointments directly from your website</p>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface">Embed Code (iframe)</p>
          <CodeBlock code={bookingEmbed} />
        </div>
        <p className="text-xs text-on-surface-variant">
          Configure availability under <strong>Settings → Business Hours</strong> and services under <strong>Settings → Services</strong>.
        </p>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 space-y-1">
        <p className="font-medium">Setup notes</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>The iframe approach works on any website — just paste the snippet into your page HTML.</li>
          <li>The direct API is for developers building custom booking flows.</li>
          <li>Service prices shown on the widget are controlled under <strong>Settings → Services</strong>.</li>
          <li>Enable <code className="font-mono bg-amber-500/10 px-1 rounded">show_on_portal</code> on each service/problem to include it in the price calculator.</li>
        </ul>
      </div>
    </div>
  )
}
