import {
  Smartphone,
  Laptop,
  Bike,
  Car,
  Trophy,
  Award,
  Gem,
  Tablet,
  Footprints,
  Gauge,
  Shirt,
  Guitar,
  Gamepad2,
  Plug,
  Watch,
  Cpu,
} from "lucide-react";
import type { IndustryPage } from "./types";
import {
  Ticket,
  Boxes,
  Bell,
  ShieldCheck,
  Camera,
  ScanLine,
  Clock,
} from "lucide-react";

export const industryPages: IndustryPage[] = [
  {
    slug: "mobile-phone-repair",
    name: "Mobile Phone Repair",
    icon: Smartphone,
    kicker: "Industry Software",
    tagline: "Built for screen swaps, battery jobs, and everything between.",
    description:
      "Mobile phone repair shops move fast — high ticket volume, tight turnaround expectations, and constant part reordering. iRepairly gives phone repair shops IMEI tracking, rapid intake, and parts management tuned to high-volume device work.",
    metaDescription:
      "Repair shop software for mobile phone repair businesses — IMEI tracking, fast intake, parts inventory, and customer updates.",
    keywords: ["mobile phone repair software", "phone repair shop system", "IMEI tracking"],
    painPoints: [
      { title: "High job volume", desc: "Dozens of screen and battery jobs a day make manual tracking error-prone." },
      { title: "Fast-moving parts stock", desc: "Screens and batteries for popular models run out quickly without alerts." },
      { title: "Warranty disputes", desc: "Without documented condition, pre-existing damage claims are hard to disprove." },
    ],
    howWeHelp: [
      { icon: ScanLine, title: "IMEI & serial capture", desc: "Record IMEI numbers at intake for warranty and theft-check purposes." },
      { icon: Boxes, title: "Model-level stock", desc: "Track screen and battery stock by exact device model." },
      { icon: Clock, title: "Fast checkout", desc: "Close common jobs like screen swaps in seconds at the counter." },
      { icon: Camera, title: "Condition photos", desc: "Capture pre-repair photos to protect against damage disputes." },
    ],
    workflow: [
      { title: "Intake & diagnosis", desc: "Log device model, IMEI, and fault, then run a quick diagnostic checklist." },
      { title: "Quote & approval", desc: "Send a quote instantly and get customer approval via SMS or portal." },
      { title: "Repair & parts deduction", desc: "Complete the repair; parts are deducted from stock automatically." },
      { title: "Pickup & payment", desc: "Notify the customer, take payment, and close the ticket in one step." },
    ],
    faqs: [
      { question: "Can I track IMEI numbers for every device?", answer: "Yes, IMEI or serial capture is built into the intake process." },
      { question: "Does it handle high daily ticket volume?", answer: "Yes, the ticketing system is designed for shops processing dozens of jobs per day." },
      { question: "Can I manage screen and battery stock by model?", answer: "Yes, inventory can be tracked down to the exact device model and part variant." },
    ],
    related: [
      { label: "Tickets", href: "/product/tickets" },
      { label: "Electronics Repair", href: "/industries/electronics-repair" },
      { label: "Tablet Repair", href: "/industries/tablet-repair" },
    ],
  },
  {
    slug: "computer-repair",
    name: "Computer Repair",
    icon: Laptop,
    kicker: "Industry Software",
    tagline: "From diagnostics to data recovery, fully tracked.",
    description:
      "Computer repair jobs are rarely quick — diagnostics, part sourcing, and software work can span days. iRepairly keeps long-running jobs organised with detailed worksheets, parts tracking, and clear customer communication throughout.",
    metaDescription:
      "Repair shop software for computer repair businesses — diagnostics tracking, parts sourcing, and multi-day job management.",
    keywords: ["computer repair software", "PC repair shop system", "IT repair management"],
    painPoints: [
      { title: "Long diagnostic times", desc: "Software and hardware faults can take hours to isolate, with little to show the customer." },
      { title: "Data sensitivity", desc: "Customer data on devices raises liability and confidentiality concerns." },
      { title: "Custom part sourcing", desc: "Specific components often need to be ordered before work can start." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Detailed worksheets", desc: "Document diagnostic steps and findings clearly for both staff and customers." },
      { icon: ShieldCheck, title: "Data handling notes", desc: "Record customer consent and data handling notes against each ticket." },
      { icon: Boxes, title: "Special-order parts", desc: "Track parts on order against a ticket so status stays accurate." },
      { icon: Bell, title: "Progress updates", desc: "Keep customers informed during multi-day repairs without extra calls." },
    ],
    workflow: [
      { title: "Intake & backup check", desc: "Log the device, note existing damage, and record data backup consent." },
      { title: "Diagnosis", desc: "Run diagnostics and document findings in a structured worksheet." },
      { title: "Repair & parts", desc: "Order and receive any special parts, then complete the repair." },
      { title: "Handover", desc: "Notify the customer, confirm data handling, and close the ticket." },
    ],
    faqs: [
      { question: "Can I document lengthy diagnostic work?", answer: "Yes, worksheets support detailed notes and multiple diagnostic steps per ticket." },
      { question: "Can I track parts that are on backorder?", answer: "Yes, tickets can reflect a waiting-on-parts status tied to purchase orders." },
      { question: "Is there a way to log data handling consent?", answer: "Yes, custom fields can capture data backup and handling consent at intake." },
    ],
    related: [
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Electronics Repair", href: "/industries/electronics-repair" },
      { label: "Tickets", href: "/product/tickets" },
    ],
  },
  {
    slug: "bicycle-repair",
    name: "Bicycle Repair",
    icon: Bike,
    kicker: "Industry Software",
    tagline: "Track every bike, every part, every service.",
    description:
      "Bicycle shops juggle servicing, custom builds, and parts sales side by side. iRepairly tracks bike make and model against each job, manages parts stock, and keeps seasonal service rushes organised.",
    metaDescription:
      "Repair shop software for bicycle repair shops — service tracking, parts inventory, and seasonal workload management.",
    keywords: ["bicycle repair software", "bike shop management system", "cycle repair tracking"],
    painPoints: [
      { title: "Seasonal demand spikes", desc: "Spring and summer bring a surge of servicing that's hard to manage manually." },
      { title: "Parts variety", desc: "Dozens of component brands and sizes make inventory tracking complex." },
      { title: "Mixed retail and service", desc: "Balancing bike sales with servicing requires one connected system." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Service tickets", desc: "Log bike make, model, and service type with a clear job history." },
      { icon: Boxes, title: "Component inventory", desc: "Track parts by brand, size, and compatibility across your stock." },
      { icon: Clock, title: "Turnaround scheduling", desc: "Manage service queues during seasonal rushes without overbooking." },
      { icon: Bell, title: "Ready-for-pickup alerts", desc: "Notify customers automatically the moment their bike is ready." },
    ],
    workflow: [
      { title: "Drop-off", desc: "Log the bike's make, model, and requested service or fault." },
      { title: "Inspection", desc: "Run a service checklist to identify additional issues before quoting." },
      { title: "Service & parts", desc: "Complete the work and deduct parts from inventory automatically." },
      { title: "Collection", desc: "Notify the customer and take payment at pickup." },
    ],
    faqs: [
      { question: "Can I manage a seasonal service rush?", answer: "Yes, job scheduling and queue views help manage high-volume periods." },
      { question: "Does it track component compatibility?", answer: "Custom fields let you tag parts by brand, size, and compatible models." },
      { question: "Can I sell bikes and parts alongside servicing?", answer: "Yes, retail sales and service tickets run from the same POS and inventory." },
    ],
    related: [
      { label: "Motorcycle Repair", href: "/industries/motorcycle-repair" },
      { label: "Stock Management", href: "/features/stock-management" },
      { label: "Job Management", href: "/features/job-management" },
    ],
  },
  {
    slug: "car-repair",
    name: "Car Repair",
    icon: Car,
    kicker: "Industry Software",
    tagline: "Keep every vehicle job organised, start to finish.",
    description:
      "Car repair and servicing shops need to track vehicle details, multi-stage repairs, and parts sourcing without losing sight of turnaround time. iRepairly gives garages a clear job board and parts-linked ticketing built for automotive work.",
    metaDescription:
      "Repair shop software for car repair and servicing garages — vehicle tracking, multi-stage job management, and parts inventory.",
    keywords: ["car repair software", "garage management system", "automotive repair tracking"],
    painPoints: [
      { title: "Multi-stage jobs", desc: "A single repair can span diagnosis, parts ordering, and multiple labour stages." },
      { title: "Vehicle record keeping", desc: "Service history needs to be easy to reference for repeat customers." },
      { title: "Bay scheduling", desc: "Coordinating which vehicle is in which bay and when is hard without a system." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Vehicle-linked tickets", desc: "Track registration, make, model, and mileage against every job." },
      { icon: Boxes, title: "Parts-linked repairs", desc: "Connect ordered parts directly to the job that's waiting on them." },
      { icon: Clock, title: "Bay & stage tracking", desc: "See which vehicles are in progress and at what stage." },
      { icon: Bell, title: "Status updates", desc: "Keep customers informed automatically during longer repairs." },
    ],
    workflow: [
      { title: "Check-in", desc: "Log vehicle details, mileage, and reported fault." },
      { title: "Diagnosis & quote", desc: "Diagnose the issue and send a quote for customer approval." },
      { title: "Repair", desc: "Complete labour stages and track parts usage against the job." },
      { title: "Handover", desc: "Notify the customer, take payment, and record service history." },
    ],
    faqs: [
      { question: "Can I keep a full service history per vehicle?", answer: "Yes, every job is logged against the vehicle and customer for future reference." },
      { question: "Does it support multi-stage repairs?", answer: "Yes, tickets can move through custom stages like diagnosis, parts, and labour." },
      { question: "Can customers approve quotes remotely?", answer: "Yes, quotes can be approved online through the Customer Portal." },
    ],
    related: [
      { label: "Motorcycle Repair", href: "/industries/motorcycle-repair" },
      { label: "Job Management", href: "/features/job-management" },
      { label: "Invoicing & Payments", href: "/features/invoicing-and-payments" },
    ],
  },
  {
    slug: "racket-restringing",
    name: "Racket Restringing",
    icon: Trophy,
    kicker: "Industry Software",
    tagline: "Track string types, tensions, and turnaround with ease.",
    description:
      "Racket restringing shops handle quick-turnaround jobs with specific customer preferences for string type and tension. iRepairly logs those preferences per customer and keeps string stock accurate as demand peaks around tournament season.",
    metaDescription:
      "Repair shop software for racket restringing services — custom string and tension tracking, fast job turnaround, and stock control.",
    keywords: ["racket restringing software", "tennis stringing shop system", "sports equipment repair"],
    painPoints: [
      { title: "Preference tracking", desc: "Customers expect their exact string and tension preference remembered every visit." },
      { title: "Tournament-season spikes", desc: "Demand surges around events, straining manual scheduling." },
      { title: "String stock variety", desc: "Dozens of string types and gauges are easy to lose track of." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Saved preferences", desc: "Store each customer's preferred string type and tension for repeat visits." },
      { icon: Clock, title: "Rapid turnaround queue", desc: "Manage same-day jobs with a simple, fast-moving queue view." },
      { icon: Boxes, title: "String inventory", desc: "Track string stock by brand, gauge, and length remaining on reel." },
      { icon: Bell, title: "Ready alerts", desc: "Notify players the moment their racket is ready for collection." },
    ],
    workflow: [
      { title: "Drop-off", desc: "Log racket, requested string, and tension preference." },
      { title: "Stringing", desc: "Complete the job and deduct string length used from stock." },
      { title: "Quality check", desc: "Confirm tension and finish before marking ready." },
      { title: "Collection", desc: "Notify the customer and take payment at pickup." },
    ],
    faqs: [
      { question: "Can I save a customer's preferred tension?", answer: "Yes, string type and tension preferences are stored on the customer profile." },
      { question: "Does it track string stock by reel length?", answer: "Yes, inventory can reflect remaining length on partial reels." },
      { question: "Can I offer same-day turnaround tracking?", answer: "Yes, a fast-moving queue view suits quick-turnaround jobs like stringing." },
    ],
    related: [
      { label: "Bat Preparation", href: "/industries/bat-preparation" },
      { label: "Stock Management", href: "/features/stock-management" },
      { label: "Customer CRM", href: "/features/customer-crm" },
    ],
  },
  {
    slug: "bat-preparation",
    name: "Bat Preparation",
    icon: Award,
    kicker: "Industry Software",
    tagline: "Knock-in, oil, and repair jobs, tracked and on time.",
    description:
      "Cricket bat preparation involves multi-day knocking-in schedules and repair work that customers want visibility into. iRepairly tracks preparation stages and keeps customers updated without daily phone calls.",
    metaDescription:
      "Repair shop software for cricket bat preparation services — knock-in stage tracking, repairs, and customer updates.",
    keywords: ["bat preparation software", "cricket bat repair shop system", "sports equipment servicing"],
    painPoints: [
      { title: "Multi-day preparation", desc: "Knock-in schedules span days, making progress hard to communicate." },
      { title: "Custom repair work", desc: "Handle grip, toe guard, and edge repairs alongside standard preparation." },
      { title: "Seasonal demand", desc: "Preparation requests spike ahead of the cricket season." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Stage tracking", desc: "Log each preparation stage so progress is visible to staff and customers." },
      { icon: Bell, title: "Progress updates", desc: "Send automatic updates as preparation stages are completed." },
      { icon: ShieldCheck, title: "Condition notes", desc: "Record bat condition and any pre-existing damage at intake." },
      { icon: Clock, title: "Seasonal scheduling", desc: "Manage a queue that scales with pre-season demand." },
    ],
    workflow: [
      { title: "Intake", desc: "Log bat details, condition, and requested preparation or repair." },
      { title: "Preparation stages", desc: "Track oiling and knocking-in progress across multiple sessions." },
      { title: "Repair work", desc: "Handle any additional repairs like toe guards or edge damage." },
      { title: "Collection", desc: "Notify the customer once preparation is complete and ready for pickup." },
    ],
    faqs: [
      { question: "Can I track multi-day knocking-in progress?", answer: "Yes, custom ticket stages can reflect each day of preparation." },
      { question: "Does it handle repair work alongside preparation?", answer: "Yes, repair tasks can be added to the same ticket as preparation." },
      { question: "Can I manage seasonal demand spikes?", answer: "Yes, the job queue and scheduling views help manage pre-season volume." },
    ],
    related: [
      { label: "Racket Restringing", href: "/industries/racket-restringing" },
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Job Management", href: "/features/job-management" },
    ],
  },
  {
    slug: "jewellery-repair",
    name: "Jewellery Repair",
    icon: Gem,
    kicker: "Industry Software",
    tagline: "High-value items deserve airtight tracking.",
    description:
      "Jewellery repair demands precise condition documentation and secure item tracking given the value involved. iRepairly logs detailed item descriptions, photos, and valuations to protect both your shop and your customers.",
    metaDescription:
      "Repair shop software for jewellery repair businesses — high-value item tracking, condition documentation, and secure records.",
    keywords: ["jewellery repair software", "jewellers shop management", "high-value item tracking"],
    painPoints: [
      { title: "High-value liability", desc: "Loss or damage disputes on valuable items carry serious risk." },
      { title: "Detailed descriptions needed", desc: "Generic intake fields don't capture gemstone, metal, and condition detail." },
      { title: "Custom work tracking", desc: "Resizing, engraving, and repair often overlap on the same item." },
    ],
    howWeHelp: [
      { icon: Camera, title: "Photo documentation", desc: "Capture detailed photos of each item at intake to protect against disputes." },
      { icon: ShieldCheck, title: "Valuation records", desc: "Log item valuation and insurance details against the ticket." },
      { icon: Ticket, title: "Detailed descriptions", desc: "Custom fields capture metal type, gemstones, and condition precisely." },
      { icon: Clock, title: "Secure job tracking", desc: "Maintain a clear, auditable trail from intake to collection." },
    ],
    workflow: [
      { title: "Intake & valuation", desc: "Document the item in detail with photos and estimated value." },
      { title: "Quote & approval", desc: "Send a quote for repair, resizing, or restoration work." },
      { title: "Repair", desc: "Complete the work with progress notes logged against the ticket." },
      { title: "Secure handover", desc: "Verify identity at collection and record final sign-off." },
    ],
    faqs: [
      { question: "Can I document item condition in detail?", answer: "Yes, custom fields and photo attachments capture precise condition notes." },
      { question: "Does it support valuation records?", answer: "Yes, item valuation can be recorded against each ticket for insurance purposes." },
      { question: "Is there an audit trail for high-value items?", answer: "Yes, every status change and handover is logged with a timestamp and user." },
    ],
    related: [
      { label: "Watch Repair", href: "/industries/watch-repair" },
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Customer CRM", href: "/features/customer-crm" },
    ],
  },
  {
    slug: "tablet-repair",
    name: "Tablet Repair",
    icon: Tablet,
    kicker: "Industry Software",
    tagline: "Screen, battery, and charging port jobs, streamlined.",
    description:
      "Tablet repair shares many needs with phone repair but with its own model and parts landscape. iRepairly tracks device model, part compatibility, and repair status so tablet jobs move as quickly as your team can work.",
    metaDescription:
      "Repair shop software for tablet repair businesses — model tracking, parts compatibility, and fast repair turnaround.",
    keywords: ["tablet repair software", "iPad repair shop system", "tablet parts tracking"],
    painPoints: [
      { title: "Model fragmentation", desc: "Dozens of tablet models each need specific, compatible parts." },
      { title: "Screen damage disputes", desc: "Pre-existing cracks need to be documented clearly before repair." },
      { title: "Data and account access", desc: "Repairs sometimes require handling passcodes or account access securely." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Model-specific intake", desc: "Capture exact tablet model and generation for accurate parts matching." },
      { icon: Camera, title: "Damage documentation", desc: "Photograph existing screen and body damage before work begins." },
      { icon: Boxes, title: "Compatible parts stock", desc: "Track screens and batteries matched to specific tablet models." },
      { icon: ShieldCheck, title: "Secure access notes", desc: "Record passcode or account access details securely against the ticket." },
    ],
    workflow: [
      { title: "Intake", desc: "Log tablet model, fault, and existing condition with photos." },
      { title: "Diagnosis & quote", desc: "Confirm the fault and send a quote for approval." },
      { title: "Repair", desc: "Complete the repair using model-matched parts from stock." },
      { title: "Pickup", desc: "Notify the customer and confirm device function before handover." },
    ],
    faqs: [
      { question: "Can I match parts to specific tablet models?", answer: "Yes, inventory can be tagged to specific models and generations." },
      { question: "Does it help document pre-existing screen damage?", answer: "Yes, photo attachments at intake protect against disputed damage claims." },
      { question: "Can I securely store device access codes?", answer: "Yes, secure custom fields can capture access details for the duration of the repair." },
    ],
    related: [
      { label: "Mobile Phone Repair", href: "/industries/mobile-phone-repair" },
      { label: "Electronics Repair", href: "/industries/electronics-repair" },
      { label: "Inventory", href: "/product/inventory" },
    ],
  },
  {
    slug: "shoe-repair",
    name: "Shoe Repair",
    icon: Footprints,
    kicker: "Industry Software",
    tagline: "Resoling, stitching, and restoration, all tracked by pair.",
    description:
      "Shoe repair and restoration shops handle a wide range of jobs from quick heel repairs to full restorations. iRepairly tracks each pair through the workshop with clear before/after documentation and simple pickup notifications.",
    metaDescription:
      "Repair shop software for shoe repair and restoration businesses — job tracking, before/after photos, and pickup notifications.",
    keywords: ["shoe repair software", "cobbler shop management", "shoe restoration tracking"],
    painPoints: [
      { title: "Wide job variety", desc: "Heel repairs, resoling, and full restorations all need different tracking." },
      { title: "Matching pairs to owners", desc: "Busy counters risk mixing up similar-looking pairs of shoes." },
      { title: "Condition disputes", desc: "Customers may dispute pre-existing wear without documented photos." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Per-pair tickets", desc: "Log each pair with a unique ticket, tag, and description." },
      { icon: Camera, title: "Before/after photos", desc: "Document condition before work and results after restoration." },
      { icon: Clock, title: "Job-type templates", desc: "Use quick templates for common jobs like resoling or heel repair." },
      { icon: Bell, title: "Pickup notifications", desc: "Automatically notify customers the moment their shoes are ready." },
    ],
    workflow: [
      { title: "Drop-off", desc: "Log shoe details, condition, and requested repair or restoration." },
      { title: "Workshop", desc: "Complete the repair and log materials used against the ticket." },
      { title: "Quality check", desc: "Photograph the finished result before marking ready." },
      { title: "Collection", desc: "Notify the customer and take payment at pickup." },
    ],
    faqs: [
      { question: "Can I track individual pairs separately?", answer: "Yes, each pair gets its own ticket with tagging to avoid mix-ups." },
      { question: "Does it support before/after photo documentation?", answer: "Yes, photos can be attached at intake and again on completion." },
      { question: "Can I use templates for common repairs?", answer: "Yes, common job types can be saved as quick-start templates." },
    ],
    related: [
      { label: "Clothing Alterations", href: "/industries/clothing-alterations" },
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Job Management", href: "/features/job-management" },
    ],
  },
  {
    slug: "motorcycle-repair",
    name: "Motorcycle Repair",
    icon: Gauge,
    kicker: "Industry Software",
    tagline: "Servicing, parts, and repairs for every bike that rolls in.",
    description:
      "Motorcycle repair shops balance servicing schedules, part sourcing, and MOT-style checks. iRepairly keeps vehicle records, service history, and parts usage connected so nothing gets lost between the bay and the front desk.",
    metaDescription:
      "Repair shop software for motorcycle repair and servicing shops — vehicle records, service history, and parts tracking.",
    keywords: ["motorcycle repair software", "motorbike shop management", "bike servicing tracking"],
    painPoints: [
      { title: "Service history tracking", desc: "Repeat customers expect their service history readily available." },
      { title: "Specialist parts sourcing", desc: "Model-specific parts often need to be ordered before work starts." },
      { title: "Seasonal servicing demand", desc: "Spring brings a surge in servicing requests that's hard to schedule manually." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Vehicle-linked records", desc: "Track make, model, and registration against every service and repair." },
      { icon: Boxes, title: "Parts sourcing", desc: "Track ordered parts against the job that's waiting on them." },
      { icon: Clock, title: "Service scheduling", desc: "Manage booking queues during seasonal servicing peaks." },
      { icon: Bell, title: "Completion alerts", desc: "Notify riders automatically when their bike is ready for collection." },
    ],
    workflow: [
      { title: "Check-in", desc: "Log bike details, mileage, and requested service or fault." },
      { title: "Inspection & quote", desc: "Run a service checklist and send a quote for approval." },
      { title: "Repair & parts", desc: "Complete the work and track parts usage against stock." },
      { title: "Handover", desc: "Notify the customer, take payment, and log service history." },
    ],
    faqs: [
      { question: "Can I keep service history per bike?", answer: "Yes, every job is logged against the vehicle for future reference." },
      { question: "Does it help with seasonal booking demand?", answer: "Yes, scheduling views help manage servicing queues during peak season." },
      { question: "Can I track specialist parts on order?", answer: "Yes, purchase orders can be linked directly to the waiting job." },
    ],
    related: [
      { label: "Car Repair", href: "/industries/car-repair" },
      { label: "Bicycle Repair", href: "/industries/bicycle-repair" },
      { label: "Stock Management", href: "/features/stock-management" },
    ],
  },
  {
    slug: "clothing-alterations",
    name: "Clothing Alterations",
    icon: Shirt,
    kicker: "Industry Software",
    tagline: "Fittings, alterations, and pickups without the mix-ups.",
    description:
      "Alteration shops manage fittings, measurements, and multiple garments per customer at once. iRepairly keeps garment details, measurements, and due dates organised so nothing gets handed back to the wrong customer.",
    metaDescription:
      "Repair shop software for clothing alteration businesses — garment tracking, measurement notes, and pickup scheduling.",
    keywords: ["clothing alterations software", "tailor shop management", "garment tracking system"],
    painPoints: [
      { title: "Multiple garments per order", desc: "Orders often include several items that need to stay linked together." },
      { title: "Measurement accuracy", desc: "Measurements need to be recorded precisely and referenced during fitting." },
      { title: "Deadline-driven work", desc: "Event dates like weddings mean deadlines can't slip." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Garment tickets", desc: "Track each garment with measurements, alteration notes, and due date." },
      { icon: Clock, title: "Deadline tracking", desc: "Flag time-sensitive orders so they're prioritised correctly." },
      { icon: Camera, title: "Fitting notes", desc: "Attach photos and notes from fitting sessions to the order." },
      { icon: Bell, title: "Pickup reminders", desc: "Automatically remind customers as their pickup date approaches." },
    ],
    workflow: [
      { title: "Consultation", desc: "Log garment details, requested alterations, and measurements." },
      { title: "Fitting", desc: "Record fitting notes and any adjustments needed." },
      { title: "Alteration", desc: "Complete the work and mark the garment ready." },
      { title: "Collection", desc: "Notify the customer and confirm fit at pickup." },
    ],
    faqs: [
      { question: "Can I track multiple garments in one order?", answer: "Yes, an order can group multiple garments while tracking each individually." },
      { question: "Does it support deadline-driven work like weddings?", answer: "Yes, due dates can be flagged and prioritised in the job queue." },
      { question: "Can I record measurements per customer?", answer: "Yes, measurements are stored on the customer profile for future orders." },
    ],
    related: [
      { label: "Shoe Repair", href: "/industries/shoe-repair" },
      { label: "Customer CRM", href: "/features/customer-crm" },
      { label: "Worksheets", href: "/features/worksheets" },
    ],
  },
  {
    slug: "guitar-repair",
    name: "Guitar Repair",
    icon: Guitar,
    kicker: "Industry Software",
    tagline: "Setups, restorations, and repairs for every instrument.",
    description:
      "Guitar and instrument repair spans quick setups to lengthy restorations. iRepairly documents instrument details, work performed, and parts used, keeping luthiers and front-of-house staff on the same page.",
    metaDescription:
      "Repair shop software for guitar and instrument repair businesses — job tracking, restoration notes, and parts inventory.",
    keywords: ["guitar repair software", "instrument repair shop system", "luthier management software"],
    painPoints: [
      { title: "Varying job complexity", desc: "Quick setups and multi-week restorations need different tracking approaches." },
      { title: "Specialist parts", desc: "Pickups, tuners, and hardware vary widely by instrument make and model." },
      { title: "Customer expectations", desc: "Musicians often need clear timelines around gigs and tours." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Instrument tickets", desc: "Log make, model, and requested work per instrument." },
      { icon: Boxes, title: "Hardware inventory", desc: "Track pickups, tuners, and parts stock by compatibility." },
      { icon: Clock, title: "Timeline tracking", desc: "Set and communicate realistic completion dates for restorations." },
      { icon: Bell, title: "Status updates", desc: "Keep musicians updated automatically during longer jobs." },
    ],
    workflow: [
      { title: "Intake", desc: "Log instrument details, condition, and requested setup or repair." },
      { title: "Assessment", desc: "Diagnose the work needed and send a quote for approval." },
      { title: "Repair or restoration", desc: "Complete the work, logging parts and labour against the ticket." },
      { title: "Collection", desc: "Notify the customer once the instrument is ready for pickup." },
    ],
    faqs: [
      { question: "Can I track long restoration projects?", answer: "Yes, tickets can span extended timelines with staged progress notes." },
      { question: "Does it track specialist hardware stock?", answer: "Yes, inventory can be tagged by instrument compatibility." },
      { question: "Can I give customers a realistic completion estimate?", answer: "Yes, due dates and status updates keep customers informed throughout." },
    ],
    related: [
      { label: "Watch Repair", href: "/industries/watch-repair" },
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Job Management", href: "/features/job-management" },
    ],
  },
  {
    slug: "game-console-repair",
    name: "Game Console Repair",
    icon: Gamepad2,
    kicker: "Industry Software",
    tagline: "HDMI ports, drives, and controllers, all tracked.",
    description:
      "Console repair shops deal with a mix of common faults and tricky hardware failures. iRepairly tracks console model, fault type, and parts stock so recurring jobs like HDMI port repairs move quickly through your workshop.",
    metaDescription:
      "Repair shop software for game console repair businesses — model and fault tracking, parts inventory, and fast turnaround.",
    keywords: ["game console repair software", "console repair shop system", "gaming hardware repair"],
    painPoints: [
      { title: "Recurring common faults", desc: "Certain faults, like HDMI port damage, recur across many units." },
      { title: "Data on storage drives", desc: "Consoles often hold save data and account information customers care about." },
      { title: "Fast customer expectations", desc: "Gamers often want quick turnaround on popular repairs." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Fault-type tagging", desc: "Tag common faults for faster diagnosis and consistent quoting." },
      { icon: ShieldCheck, title: "Data handling notes", desc: "Record customer consent around storage and save data." },
      { icon: Boxes, title: "Common parts stock", desc: "Keep frequently used parts like HDMI ports and drives well stocked." },
      { icon: Clock, title: "Quick-turnaround queue", desc: "Prioritise fast, common repairs to keep customers happy." },
    ],
    workflow: [
      { title: "Intake", desc: "Log console model, fault, and any data handling notes." },
      { title: "Diagnosis", desc: "Confirm the fault and quote using standard fault-type pricing." },
      { title: "Repair", desc: "Complete the repair and deduct parts from stock." },
      { title: "Pickup", desc: "Test functionality with the customer and confirm handover." },
    ],
    faqs: [
      { question: "Can I set standard pricing for common faults?", answer: "Yes, common fault types can have preset pricing for fast quoting." },
      { question: "Does it help track data handling consent?", answer: "Yes, custom fields can capture consent for handling stored data." },
      { question: "Can I keep frequently used parts well stocked?", answer: "Yes, reorder alerts help prevent running out of high-turnover parts." },
    ],
    related: [
      { label: "Electronics Repair", href: "/industries/electronics-repair" },
      { label: "Stock Management", href: "/features/stock-management" },
      { label: "Tickets", href: "/product/tickets" },
    ],
  },
  {
    slug: "appliance-repair",
    name: "Appliance Repair",
    icon: Plug,
    kicker: "Industry Software",
    tagline: "In-home and workshop appliance jobs, one system.",
    description:
      "Appliance repair often means juggling in-home call-outs alongside workshop jobs. iRepairly tracks appliance model, fault, and parts needed whether the job happens on-site or on the bench.",
    metaDescription:
      "Repair shop software for appliance repair businesses — call-out scheduling, fault tracking, and parts inventory.",
    keywords: ["appliance repair software", "in-home repair scheduling", "appliance service tracking"],
    painPoints: [
      { title: "On-site vs workshop jobs", desc: "Call-out repairs and bench repairs need to be tracked consistently." },
      { title: "Parts availability", desc: "Technicians need to know part stock before heading to a call-out." },
      { title: "Scheduling call-outs", desc: "Coordinating technician routes and appointment windows is time-consuming." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Appliance-linked tickets", desc: "Track brand, model, and fault for every appliance job." },
      { icon: Boxes, title: "Parts visibility", desc: "Check part stock before dispatching a technician to a call-out." },
      { icon: Clock, title: "Appointment scheduling", desc: "Schedule in-home visits alongside workshop repair queues." },
      { icon: Bell, title: "Arrival notifications", desc: "Notify customers automatically ahead of a scheduled visit." },
    ],
    workflow: [
      { title: "Booking", desc: "Log appliance details and schedule an in-home or workshop appointment." },
      { title: "Diagnosis", desc: "Diagnose the fault and quote for approval before parts are ordered." },
      { title: "Repair", desc: "Complete the repair on-site or in the workshop, deducting parts used." },
      { title: "Completion", desc: "Confirm the fix with the customer and close the ticket." },
    ],
    faqs: [
      { question: "Can I schedule in-home appointments?", answer: "Yes, appointment scheduling supports both call-out and workshop jobs." },
      { question: "Does it show part stock before a call-out?", answer: "Yes, technicians can check availability before heading to a job." },
      { question: "Can I track jobs across multiple technicians?", answer: "Yes, jobs can be assigned and tracked per technician or route." },
    ],
    related: [
      { label: "Electronics Repair", href: "/industries/electronics-repair" },
      { label: "Job Management", href: "/features/job-management" },
      { label: "Stock Management", href: "/features/stock-management" },
    ],
  },
  {
    slug: "watch-repair",
    name: "Watch Repair",
    icon: Watch,
    kicker: "Industry Software",
    tagline: "Precision work deserves precise records.",
    description:
      "Watch repair and servicing involves delicate, high-value work that demands careful documentation. iRepairly tracks movement type, condition, and service history so every watch is accounted for from drop-off to collection.",
    metaDescription:
      "Repair shop software for watch repair and servicing businesses — condition tracking, service history, and high-value item records.",
    keywords: ["watch repair software", "watchmaker shop management", "watch servicing tracking"],
    painPoints: [
      { title: "High-value liability", desc: "Watches often carry significant value, raising the stakes on documentation." },
      { title: "Movement-specific parts", desc: "Movements and components vary widely between brands and models." },
      { title: "Service history expectations", desc: "Customers expect a clear record of past servicing." },
    ],
    howWeHelp: [
      { icon: Camera, title: "Condition photos", desc: "Document case and dial condition in detail before work begins." },
      { icon: Ticket, title: "Movement records", desc: "Log movement type and serial number against each ticket." },
      { icon: ShieldCheck, title: "Valuation & insurance notes", desc: "Record estimated value for insurance and handover purposes." },
      { icon: Clock, title: "Service history", desc: "Keep a full service history against each watch and customer." },
    ],
    workflow: [
      { title: "Intake & valuation", desc: "Document the watch in detail with photos and estimated value." },
      { title: "Diagnosis", desc: "Identify the fault or servicing needs and quote for approval." },
      { title: "Servicing or repair", desc: "Complete the work with detailed notes on parts and movement." },
      { title: "Secure handover", desc: "Verify identity and record final sign-off at collection." },
    ],
    faqs: [
      { question: "Can I record movement and serial details?", answer: "Yes, custom fields capture movement type, brand, and serial number." },
      { question: "Does it help with insurance valuation?", answer: "Yes, estimated value can be logged against the ticket for insurance purposes." },
      { question: "Is service history kept per watch?", answer: "Yes, all past servicing is retained against the item and customer." },
    ],
    related: [
      { label: "Jewellery Repair", href: "/industries/jewellery-repair" },
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Customer CRM", href: "/features/customer-crm" },
    ],
  },
  {
    slug: "electronics-repair",
    name: "Electronics Repair",
    icon: Cpu,
    kicker: "Industry Software",
    tagline: "From consumer gadgets to specialist equipment.",
    description:
      "Electronics repair shops cover everything from consumer gadgets to specialist equipment, often side by side. iRepairly's configurable fields and inventory adapt to whatever device category walks through the door.",
    metaDescription:
      "Repair shop software for general electronics repair businesses — configurable intake fields, parts inventory, and fault tracking.",
    keywords: ["electronics repair software", "electronic device repair shop", "gadget repair tracking"],
    painPoints: [
      { title: "Wide device variety", desc: "A single shop might repair phones, drones, speakers, and more." },
      { title: "Fault diversity", desc: "Diagnostic notes vary hugely across device categories." },
      { title: "Parts sourcing complexity", desc: "Sourcing components for niche devices takes time to track." },
    ],
    howWeHelp: [
      { icon: Ticket, title: "Configurable intake", desc: "Adapt intake fields per device category, from drones to speakers." },
      { icon: Boxes, title: "Flexible inventory", desc: "Track parts across a wide range of device types in one system." },
      { icon: Camera, title: "Condition documentation", desc: "Photograph and note condition regardless of device type." },
      { icon: Bell, title: "Status updates", desc: "Keep customers informed automatically as repairs progress." },
    ],
    workflow: [
      { title: "Intake", desc: "Log device type, fault, and condition using category-specific fields." },
      { title: "Diagnosis & quote", desc: "Diagnose the issue and send a quote for approval." },
      { title: "Repair", desc: "Complete the repair, logging parts and labour used." },
      { title: "Pickup", desc: "Notify the customer and confirm function before handover." },
    ],
    faqs: [
      { question: "Can it handle many different device types?", answer: "Yes, configurable fields and categories adapt to almost any electronic device." },
      { question: "Does it support niche or specialist equipment?", answer: "Yes, custom categories and fields can be created for any device type you repair." },
      { question: "Can I track parts across categories in one place?", answer: "Yes, inventory spans all device categories within a single account." },
    ],
    related: [
      { label: "Mobile Phone Repair", href: "/industries/mobile-phone-repair" },
      { label: "Computer Repair", href: "/industries/computer-repair" },
      { label: "Business Types", href: "/features/business-types" },
    ],
  },
];
