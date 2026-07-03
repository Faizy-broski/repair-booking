import {
  Ticket,
  ShoppingCart,
  Boxes,
  BarChart3,
  Sparkles,
  Clock,
  Bell,
  Camera,
  Users,
  Zap,
  Percent,
  Gift,
  ScanLine,
  PackageSearch,
  TrendingUp,
  PieChart,
  MessageSquare,
  Wand2,
  Brain,
  ShieldCheck,
} from "lucide-react";
import type { CapabilityPage } from "./types";

export const productPages: CapabilityPage[] = [
  {
    slug: "tickets",
    name: "Tickets",
    icon: Ticket,
    kicker: "Repair Job Management",
    tagline: "Every repair job, tracked from drop-off to pickup.",
    description:
      "iRepairly's ticketing system gives your shop a single, organised view of every repair in progress. Log intake details in seconds, assign jobs to technicians, and keep customers updated automatically as status changes — so nothing falls through the cracks and nobody has to chase you for an update.",
    metaDescription:
      "Manage every repair job with iRepairly's ticketing system — intake, status tracking, technician assignment, and automated customer updates in one place.",
    keywords: ["repair tickets", "job tracking software", "repair ticketing system", "repair shop workflow"],
    benefits: [
      { icon: Clock, title: "Faster intake", desc: "Capture device details, faults, and photos in under a minute with guided intake forms." },
      { icon: Bell, title: "Automatic updates", desc: "Customers get SMS and email notifications the moment a ticket status changes." },
      { icon: Camera, title: "Visual proof", desc: "Attach before/after photos to every ticket to protect your shop and reassure customers." },
      { icon: Users, title: "Clear ownership", desc: "Assign jobs to technicians and see workload at a glance across your whole team." },
    ],
    useCases: [
      { title: "Walk-in diagnostics", desc: "Open a ticket at the counter, capture the fault, and quote the customer before they leave." },
      { title: "Multi-stage repairs", desc: "Move jobs through custom statuses like Awaiting Parts, In Progress, and Ready for Collection." },
      { title: "Warranty tracking", desc: "Flag warranty repairs automatically and keep a searchable history for every device." },
      { title: "Technician handoff", desc: "Reassign a ticket between technicians without losing any notes, photos, or history." },
    ],
    faqs: [
      { question: "Can I customise ticket statuses?", answer: "Yes. You can rename, reorder, and add statuses to match exactly how your workshop operates." },
      { question: "Do customers get notified automatically?", answer: "Yes, SMS and email notifications fire automatically on status changes, so your front desk doesn't have to." },
      { question: "Can tickets link to invoices and inventory?", answer: "Every ticket connects directly to parts used and the resulting invoice, so your records stay in sync." },
    ],
    related: [
      { label: "POS", href: "/product/pos" },
      { label: "Job Management", href: "/features/job-management" },
      { label: "Customer CRM", href: "/features/customer-crm" },
    ],
  },
  {
    slug: "pos",
    name: "POS",
    icon: ShoppingCart,
    kicker: "Point of Sale",
    tagline: "A checkout built for repair shops, not generic retail.",
    description:
      "iRepairly's point of sale connects sales, repairs, and inventory in real time. Ring up parts and accessories, take split or partial payments, and close out repair tickets — all from a single, fast checkout screen designed for the counter, not a boardroom.",
    metaDescription:
      "iRepairly's POS combines retail checkout with repair ticketing — barcode scanning, split payments, gift cards, and real-time inventory sync.",
    keywords: ["repair shop POS", "point of sale software", "retail checkout system", "repair shop payments"],
    benefits: [
      { icon: ScanLine, title: "Barcode scanning", desc: "Scan parts and accessories straight into the cart with any USB or Bluetooth scanner." },
      { icon: Percent, title: "Flexible discounts", desc: "Apply line-item or order-level discounts, staff pricing, and promo codes in a click." },
      { icon: Gift, title: "Gift cards & credit", desc: "Sell and redeem gift cards, and issue store credit for exchanges and refunds." },
      { icon: Zap, title: "Real-time stock sync", desc: "Every sale deducts stock instantly, so your inventory count is always accurate." },
    ],
    useCases: [
      { title: "Counter sales", desc: "Sell accessories, cases, and parts without opening a repair ticket." },
      { title: "Repair checkout", desc: "Close a repair ticket, apply parts and labour, and take payment in one flow." },
      { title: "Split payments", desc: "Accept part cash, part card, or split a bill between two customers." },
      { title: "Offline resilience", desc: "Keep selling during a connectivity drop; transactions sync once you're back online." },
    ],
    faqs: [
      { question: "Does the POS work with barcode scanners and receipt printers?", answer: "Yes, it supports standard USB and Bluetooth scanners along with thermal receipt and label printers." },
      { question: "Can I take split or partial payments?", answer: "Yes, you can split a single transaction across multiple payment methods or take a deposit and balance later." },
      { question: "Is the POS linked to inventory automatically?", answer: "Every sale updates stock levels in real time across all your connected locations." },
    ],
    related: [
      { label: "Inventory", href: "/product/inventory" },
      { label: "Tickets", href: "/product/tickets" },
      { label: "Invoicing & Payments", href: "/features/invoicing-and-payments" },
    ],
  },
  {
    slug: "inventory",
    name: "Inventory",
    icon: Boxes,
    kicker: "Stock & Parts Management",
    tagline: "Know exactly what's on your shelves, everywhere.",
    description:
      "Track parts, accessories, and devices across one or many locations with iRepairly's inventory tools. Get low-stock alerts before you run out, manage purchase orders with suppliers, and see exactly which parts are tied up in open repair tickets.",
    metaDescription:
      "Manage repair shop inventory with real-time stock levels, low-stock alerts, purchase orders, and multi-location tracking in iRepairly.",
    keywords: ["repair shop inventory", "parts inventory software", "stock management", "purchase orders"],
    benefits: [
      { icon: Bell, title: "Low-stock alerts", desc: "Get notified automatically when a part drops below your reorder threshold." },
      { icon: PackageSearch, title: "Serial & IMEI tracking", desc: "Track individual units by serial number or IMEI for devices and high-value parts." },
      { icon: Boxes, title: "Multi-location stock", desc: "See and transfer stock between branches without spreadsheets or phone calls." },
      { icon: TrendingUp, title: "Purchase orders", desc: "Raise POs to suppliers and receive stock directly into inventory when it arrives." },
    ],
    useCases: [
      { title: "Parts reservation", desc: "Reserve a part for an open ticket so it isn't accidentally sold at the counter." },
      { title: "Stock takes", desc: "Run cycle counts or full stock takes with variance reporting built in." },
      { title: "Supplier reordering", desc: "Generate purchase orders automatically based on reorder points." },
      { title: "Trade-in intake", desc: "Bring traded-in devices into inventory with condition notes and resale pricing." },
    ],
    faqs: [
      { question: "Can I manage inventory across multiple branches?", answer: "Yes, each location has its own stock levels with the option to transfer items between branches." },
      { question: "Does inventory update when a ticket uses a part?", answer: "Yes, parts allocated to a repair ticket are deducted from stock automatically." },
      { question: "Can I track serial numbers or IMEIs?", answer: "Yes, individual units can be tracked by serial number, IMEI, or custom identifiers." },
    ],
    related: [
      { label: "POS", href: "/product/pos" },
      { label: "Stock Management", href: "/features/stock-management" },
      { label: "Trade/Buy In Items", href: "/features/trade-buy-in-items" },
    ],
  },
  {
    slug: "analytics",
    name: "Analytics",
    icon: BarChart3,
    kicker: "Reporting & Insights",
    tagline: "See what's actually driving your shop's revenue.",
    description:
      "iRepairly's analytics turn your day-to-day operations into decisions. Track sales, repair turnaround, technician performance, and branch profitability in dashboards that update in real time — no exporting to a spreadsheet required.",
    metaDescription:
      "Real-time analytics and reporting for repair shops — sales, profit, technician performance, and branch comparisons in one dashboard.",
    keywords: ["repair shop analytics", "reporting software", "business intelligence", "shop performance dashboard"],
    benefits: [
      { icon: PieChart, title: "Revenue breakdowns", desc: "See sales by category, technician, branch, or time period at a glance." },
      { icon: TrendingUp, title: "Turnaround tracking", desc: "Monitor average repair time so you can spot bottlenecks before customers do." },
      { icon: BarChart3, title: "Branch comparisons", desc: "Compare performance across locations to spot what's working and replicate it." },
      { icon: Users, title: "Staff performance", desc: "See individual technician output, commission, and job completion rates." },
    ],
    useCases: [
      { title: "Monthly P&L review", desc: "Pull profit and loss reports by branch without waiting on a bookkeeper." },
      { title: "Technician scorecards", desc: "Review who's completing the most jobs and where training might help." },
      { title: "Inventory profitability", desc: "See which parts and services generate the most margin." },
      { title: "Growth planning", desc: "Track revenue trends over time to plan staffing and stock ahead of demand." },
    ],
    faqs: [
      { question: "Do reports update in real time?", answer: "Yes, dashboards reflect sales, repairs, and inventory as they happen — no manual refresh needed." },
      { question: "Can I export reports?", answer: "Yes, most reports can be exported to CSV or PDF for accountants and stakeholders." },
      { question: "Can I compare multiple branches?", answer: "Yes, multi-branch accounts can filter and compare performance side by side." },
    ],
    related: [
      { label: "Reporting", href: "/features/reporting" },
      { label: "Multiple Stores/Locations", href: "/features/multiple-stores-locations" },
      { label: "AI co-pilot", href: "/product/ai-co-pilot" },
    ],
  },
  {
    slug: "ai-co-pilot",
    name: "AI co-pilot",
    icon: Sparkles,
    kicker: "AI-Assisted Operations",
    tagline: "An assistant that already knows your shop.",
    description:
      "iRepairly's AI co-pilot drafts customer replies, suggests diagnostic notes, and flags anomalies in your reporting — using the context of your actual tickets, customers, and inventory. It's a starting point your team reviews and sends, not an autopilot.",
    metaDescription:
      "iRepairly's AI co-pilot helps repair shops draft customer messages, summarise diagnostics, and surface reporting insights automatically.",
    keywords: ["AI repair software", "AI co-pilot", "repair shop automation", "AI customer service"],
    benefits: [
      { icon: MessageSquare, title: "Drafted replies", desc: "Get suggested responses to customer messages based on ticket history and context." },
      { icon: Wand2, title: "Diagnostic summaries", desc: "Turn technician notes into clear, customer-facing repair summaries automatically." },
      { icon: Brain, title: "Smart insights", desc: "Surface trends in your reporting, like recurring faults or slow-moving parts." },
      { icon: ShieldCheck, title: "Human in the loop", desc: "Every suggestion is reviewed by your team before it reaches a customer." },
    ],
    useCases: [
      { title: "Customer messaging", desc: "Draft a status update or quote explanation in seconds, then edit and send." },
      { title: "Intake notes", desc: "Convert quick technician shorthand into structured, readable ticket notes." },
      { title: "Anomaly flags", desc: "Get flagged when a repair is taking unusually long or a part is trending in returns." },
      { title: "Report summaries", desc: "Ask for a plain-language summary of last month's performance instead of reading raw tables." },
    ],
    faqs: [
      { question: "Can the AI co-pilot make mistakes?", answer: "Yes. It provides recommendations, but important decisions should always be reviewed by your team before they're finalised." },
      { question: "Does it send messages automatically?", answer: "No, all AI-drafted messages are queued for staff review before sending, by default." },
      { question: "What data does it use?", answer: "It uses your shop's own tickets, customer history, and inventory data — never data from other businesses." },
    ],
    related: [
      { label: "Analytics", href: "/product/analytics" },
      { label: "Automation", href: "/features/automation" },
      { label: "Tickets", href: "/product/tickets" },
    ],
  },
];
