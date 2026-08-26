import {
  Car,
  Wrench,
  Building2,
  Smartphone,
  ShoppingCart,
  Ticket,
  Boxes,
  Bell,
  ShieldCheck,
  Camera,
  ScanLine,
  Clock,
  Calendar,
  CreditCard,
  Users,
  BarChart3,
  Repeat,
  Layers,
} from "lucide-react";
import type { ServicePage } from "../footer-pages/types";

export const servicePages: ServicePage[] = [
  {
    slug: "auto-vehicle-repair-software",
    cluster: "Auto / Vehicle Repair Software",
    name: "Auto & Vehicle Repair Software",
    icon: Car,
    kicker: "Service Software",
    tagline: "Every vehicle job, from check-in to handover, in one system.",
    description:
      "Auto and vehicle repair shops juggle diagnostics, multi-stage labour, and parts sourcing on every job. iRepairly gives you vehicle-linked tickets, parts-aware workflows, and automatic customer updates built specifically for automotive repair.",
    metaDescription:
      "Auto and vehicle repair software — vehicle-linked job tickets, parts tracking, multi-stage repairs, and customer updates for repair shops.",
    keywords: ["auto repair software", "vehicle repair software", "automotive repair system"],
    painPoints: [
      { title: "Multi-stage repairs", desc: "A single job can span diagnosis, parts ordering, and several labour stages that are easy to lose track of." },
      { title: "Vehicle history spread thin", desc: "Repeat customers expect a full service history, but paper and spreadsheets scatter it." },
      { title: "Parts delays stall jobs", desc: "Without visibility into ordered parts, technicians and front desk staff work off stale information." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Vehicle-linked tickets", desc: "Capture registration, make, model, and mileage against every job automatically." },
      { icon: Boxes, title: "Parts-aware repairs", desc: "Link ordered parts directly to the job that's waiting on them so nothing stalls silently." },
      { icon: Clock, title: "Stage tracking", desc: "Move jobs through diagnosis, quote, repair, and handover with a clear status at every step." },
      { icon: Bell, title: "Automatic updates", desc: "Keep customers informed by SMS or email without staff making manual calls." },
    ],
    workflow: [
      { title: "Check-in", desc: "Log vehicle details, mileage, and the reported fault at intake." },
      { title: "Diagnosis & quote", desc: "Diagnose the issue and send a quote for the customer to approve remotely." },
      { title: "Repair", desc: "Work through labour stages while parts are deducted from stock automatically." },
      { title: "Handover", desc: "Take payment, notify the customer, and log the job to vehicle history." },
    ],
    faqs: [
      { question: "Can I track a full service history per vehicle?", answer: "Yes, every job is logged against the vehicle and customer so history is always one click away." },
      { question: "Does it handle multi-stage repairs?", answer: "Yes, tickets move through custom stages like diagnosis, parts, and labour with clear status at each point." },
      { question: "Can customers approve quotes without visiting the shop?", answer: "Yes, quotes can be sent and approved online through the Customer Portal." },
    ],
    related: [
      { label: "Garage & Workshop Management Software", href: "/services/garage-workshop-management-software" },
      { label: "Job Management", href: "/features/job-management" },
      { label: "Invoicing & Payments", href: "/features/invoicing-and-payments" },
    ],
  },
  {
    slug: "garage-workshop-management-software",
    cluster: "Garage / Workshop Management Software",
    name: "Garage & Workshop Management Software",
    icon: Wrench,
    kicker: "Service Software",
    tagline: "Run the whole workshop floor from one screen.",
    description:
      "Garages and workshops need more than a job list — they need bay scheduling, technician workload, and parts stock all working together. iRepairly connects the shop floor to the front desk so nothing gets lost between a quote and a completed job.",
    metaDescription:
      "Garage and workshop management software — bay scheduling, technician workload, parts stock, and job tracking in one platform.",
    keywords: ["garage management software", "workshop management system", "auto shop management"],
    painPoints: [
      { title: "Bay & technician scheduling", desc: "Coordinating which vehicle is in which bay, and who's working on it, is hard to do from memory or a whiteboard." },
      { title: "Disconnected parts and jobs", desc: "Technicians often don't know if a part has arrived without walking over to ask." },
      { title: "Workload visibility", desc: "Managers struggle to see technician capacity at a glance during busy periods." },
    ],
    howWeHelp: [
      { icon: Layers, title: "Workshop job board", desc: "See every job, its stage, and assigned technician on one live board." },
      { icon: Boxes, title: "Live parts status", desc: "Technicians see part arrival status directly on the job, no walking the floor required." },
      { icon: Users, title: "Technician workload", desc: "Balance jobs across the team and spot bottlenecks before they cause delays." },
      { icon: BarChart3, title: "Shop performance reporting", desc: "Track turnaround time, revenue per bay, and technician output over time." },
    ],
    workflow: [
      { title: "Job creation", desc: "A new job is created and assigned to a bay and technician." },
      { title: "Parts check", desc: "Stock is checked automatically and any shortfalls trigger a purchase order." },
      { title: "Work in progress", desc: "Technicians update job status directly from the floor as work progresses." },
      { title: "Sign-off & reporting", desc: "Completed jobs feed straight into shop-wide performance reporting." },
    ],
    faqs: [
      { question: "Can I manage multiple bays and technicians?", answer: "Yes, jobs can be assigned to specific bays and technicians with a live view of workload." },
      { question: "Does it show technicians when parts have arrived?", answer: "Yes, parts status is visible directly on the job so technicians don't need to check separately." },
      { question: "Can I see shop performance over time?", answer: "Yes, built-in reporting covers turnaround time, revenue, and technician output." },
    ],
    related: [
      { label: "Auto & Vehicle Repair Software", href: "/services/auto-vehicle-repair-software" },
      { label: "Stock Management", href: "/features/stock-management" },
      { label: "Reporting", href: "/features/reporting" },
    ],
  },
  {
    slug: "car-dealership-software",
    cluster: "Car Dealership Software",
    name: "Car Dealership Software",
    icon: Building2,
    kicker: "Service Software",
    tagline: "Sales, servicing, and trade-ins under one roof.",
    description:
      "Dealerships sell vehicles, service them, and take trade-ins, often all in the same building. iRepairly connects sales, workshop, and inventory so a vehicle's full lifecycle — from trade-in to resale to servicing — stays in one place.",
    metaDescription:
      "Car dealership software — vehicle inventory, trade-ins, workshop servicing, and sales tracking in a single connected platform.",
    keywords: ["car dealership software", "dealership management system", "vehicle inventory software"],
    painPoints: [
      { title: "Disconnected sales and service", desc: "Sales teams and workshop staff often work from separate systems that don't talk to each other." },
      { title: "Trade-in tracking", desc: "Vehicles taken in trade need condition, valuation, and reconditioning tracked before resale." },
      { title: "Inventory across locations", desc: "Multi-location dealers need stock visibility across every lot and workshop." },
    ],
    howWeHelp: [
      { icon: Repeat, title: "Trade-in workflow", desc: "Log trade-in condition, valuation, and reconditioning work in one connected record." },
      { icon: Boxes, title: "Vehicle inventory", desc: "Track every vehicle in stock, from acquisition through reconditioning to sale." },
      { icon: Wrench, title: "Linked workshop jobs", desc: "Reconditioning and pre-sale servicing run through the same job system as customer repairs." },
      { icon: Building2, title: "Multi-location visibility", desc: "See stock and jobs across every lot and workshop from a single dashboard." },
    ],
    workflow: [
      { title: "Acquisition", desc: "Log a new vehicle from trade-in or purchase with full condition notes." },
      { title: "Reconditioning", desc: "Route the vehicle through workshop jobs to get it sale-ready." },
      { title: "Listing & sale", desc: "Move the vehicle to inventory for sale once reconditioning is complete." },
      { title: "Handover", desc: "Complete the sale and keep servicing history attached for future visits." },
    ],
    faqs: [
      { question: "Can I track trade-in vehicles through reconditioning?", answer: "Yes, trade-ins move through the same job system used for customer repairs, so nothing is untracked." },
      { question: "Does it support multiple lots or locations?", answer: "Yes, inventory and jobs can be tracked separately per location with a combined view for managers." },
      { question: "Can service history follow a vehicle after it's sold?", answer: "Yes, service history stays attached to the vehicle record for future visits." },
    ],
    related: [
      { label: "Garage & Workshop Management Software", href: "/services/garage-workshop-management-software" },
      { label: "Trade/Buy In Items", href: "/features/trade-buy-in-items" },
      { label: "Multiple Stores/Locations", href: "/features/multiple-stores-locations" },
    ],
  },
  {
    slug: "mobile-repair-shop-software",
    cluster: "Mobile / Repair Shop Software",
    name: "Mobile & Repair Shop Software",
    icon: Smartphone,
    kicker: "Service Software",
    tagline: "High-volume device repairs, tracked from intake to pickup.",
    description:
      "Mobile and general repair shops move fast — high ticket volume, quick turnaround, and constant parts reordering. iRepairly gives repair shops IMEI capture, rapid intake, and model-level stock tracking built for high-volume device work.",
    metaDescription:
      "Mobile and repair shop software — IMEI tracking, fast intake, model-level parts stock, and customer updates for device repair shops.",
    keywords: ["mobile repair shop software", "phone repair software", "repair shop management system"],
    painPoints: [
      { title: "High job volume", desc: "Dozens of device jobs a day make manual tracking error-prone and slow." },
      { title: "Fast-moving parts stock", desc: "Screens and batteries for popular models run out quickly without reorder alerts." },
      { title: "Warranty disputes", desc: "Without documented condition at intake, pre-existing damage claims are hard to disprove." },
    ],
    howWeHelp: [
      { icon: ScanLine, title: "IMEI & serial capture", desc: "Record IMEI or serial numbers at intake for warranty and theft-check purposes." },
      { icon: Boxes, title: "Model-level stock", desc: "Track parts stock down to the exact device model and variant." },
      { icon: Clock, title: "Fast checkout", desc: "Close common jobs like screen or battery swaps in seconds at the counter." },
      { icon: Camera, title: "Condition photos", desc: "Capture pre-repair photos to protect against damage disputes." },
    ],
    workflow: [
      { title: "Intake & diagnosis", desc: "Log device model, IMEI, and fault, then run a quick diagnostic checklist." },
      { title: "Quote & approval", desc: "Send a quote instantly and get customer approval by SMS or portal." },
      { title: "Repair & parts deduction", desc: "Complete the repair while parts are deducted from stock automatically." },
      { title: "Pickup & payment", desc: "Notify the customer, take payment, and close the ticket in one step." },
    ],
    faqs: [
      { question: "Can I track IMEI numbers for every device?", answer: "Yes, IMEI or serial capture is built into the intake process." },
      { question: "Does it handle high daily ticket volume?", answer: "Yes, the ticketing system is designed for shops processing dozens of jobs per day." },
      { question: "Can I manage parts stock by exact model?", answer: "Yes, inventory can be tracked down to the exact device model and part variant." },
    ],
    related: [
      { label: "Booking & POS Features", href: "/services/booking-pos-features" },
      { label: "Stock Management", href: "/features/stock-management" },
      { label: "Tickets", href: "/product/tickets" },
    ],
  },
  {
    slug: "booking-pos-features",
    cluster: "Booking & POS Features",
    name: "Booking & POS Features",
    icon: ShoppingCart,
    kicker: "Service Software",
    tagline: "Take bookings, check out customers, get paid, all in one flow.",
    description:
      "Getting a customer from booking to checkout should take seconds, not phone tag and manual invoices. iRepairly combines online booking, an in-store point of sale, and integrated payments so every job — booked or walk-in — closes cleanly.",
    metaDescription:
      "Booking and point of sale software for repair and service businesses — online booking, in-store POS, and integrated payments.",
    keywords: ["repair shop booking software", "repair shop POS", "service booking and payments"],
    painPoints: [
      { title: "Booking chaos", desc: "Phone and walk-in bookings get double-booked or lost without a shared calendar." },
      { title: "Slow checkout", desc: "Manually writing up invoices at the counter slows down busy periods." },
      { title: "Disconnected payments", desc: "Payments taken outside the job system make reconciliation a manual chore." },
    ],
    howWeHelp: [
      { icon: Calendar, title: "Online booking", desc: "Let customers book appointments online directly into your live schedule." },
      { icon: ShoppingCart, title: "Fast point of sale", desc: "Check out repairs, parts, and retail items from a single, fast POS screen." },
      { icon: CreditCard, title: "Integrated payments", desc: "Take card and contactless payments that reconcile automatically against the job." },
      { icon: Bell, title: "Booking reminders", desc: "Automatic reminders cut down on no-shows for scheduled appointments." },
    ],
    workflow: [
      { title: "Booking", desc: "A customer books online or over the phone into an available slot." },
      { title: "Check-in", desc: "The booking becomes a job automatically when the customer arrives." },
      { title: "Service", desc: "Complete the work, adding any extra parts or services to the ticket." },
      { title: "Checkout", desc: "Take payment at the POS and the job closes with a synced invoice." },
    ],
    faqs: [
      { question: "Can customers book appointments online?", answer: "Yes, online booking syncs directly with your live schedule to avoid double-booking." },
      { question: "Does the POS handle both repairs and retail sales?", answer: "Yes, repairs, parts, and retail items can all be checked out from the same POS screen." },
      { question: "Do payments reconcile automatically?", answer: "Yes, payments taken at the POS are tied directly to the job and reflected in reporting." },
    ],
    related: [
      { label: "Mobile & Repair Shop Software", href: "/services/mobile-repair-shop-software" },
      { label: "Invoicing & Payments", href: "/features/invoicing-and-payments" },
      { label: "POS", href: "/product/pos" },
    ],
  },
];
