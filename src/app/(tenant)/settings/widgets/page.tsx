'use client'
import { useState } from 'react'
import { Copy, CheckCheck, Code2, Search, Tag, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative rounded-lg bg-gray-900 p-4">
      <button
        onClick={copy}
        className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairpos.tech'

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
//   ticket_number: "TEC-00001",
//   status: "repaired",
//   status_label: "Ready for Collection",
//   device: "Apple iPhone 15",
//   issue: "Screen replacement",
//   created_at: "...",
//   updated_at: "...",
//   store_name: "TechFix"
// }`

  const directApiPrices = `// Direct API — Service Prices
fetch('${appUrl}/api/public/service-prices?subdomain=${subdomain}')
  .then(r => r.json())
  .then(data => console.log(data.data))

// Response shape:
// {
//   business: { name: "TechFix", currency: "GBP" },
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Code2 className="h-5 w-5 text-blue-600" />
          Embeddable Widgets
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Add these widgets to your website so customers can track repairs and get instant prices.
          Your subdomain: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-blue-700">{subdomain}</code>
        </p>
      </div>

      {/* Repair Tracker */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
            <Search className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Repair Status Tracker</h2>
            <p className="text-xs text-gray-500">Customers enter their ticket number + phone to check repair status</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Embed Code (iframe)</p>
          <CodeBlock code={trackerEmbed} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Direct API</p>
          <CodeBlock code={directApiTracker} />
        </div>
      </div>

      {/* Price Calculator */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
            <Tag className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Price Calculator</h2>
            <p className="text-xs text-gray-500">Customers browse your service catalogue and get instant repair prices</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Embed Code (iframe)</p>
          <CodeBlock code={priceCalcEmbed} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Direct API</p>
          <CodeBlock code={directApiPrices} />
        </div>
      </div>

      {/* Online Booking */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
            <CalendarDays className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Online Booking</h2>
            <p className="text-xs text-gray-500">Let customers book appointments directly from your website</p>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Embed Code (iframe)</p>
          <CodeBlock code={bookingEmbed} />
        </div>
        <p className="text-xs text-gray-400">
          Configure availability under <strong>Settings → Business Hours</strong> and services under <strong>Settings → Services</strong>.
        </p>
      </div>

      {/* Notes */}
      <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800 space-y-1">
        <p className="font-medium">Setup notes</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>The iframe approach works on any website — just paste the snippet into your page HTML.</li>
          <li>The direct API is for developers building custom booking flows.</li>
          <li>Service prices shown on the widget are controlled under <strong>Settings → Services</strong>.</li>
          <li>Enable <code className="font-mono bg-amber-100 px-1 rounded">show_on_portal</code> on each service/problem to include it in the price calculator.</li>
        </ul>
      </div>
    </div>
  )
}
