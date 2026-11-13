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
      "Repair Booking is automotive repair software that will make your automotive repair business much simpler. It schedules bookings, streamlines jobs, and ensures customers' information is secure and well-organized. It provides you with a visual record of each job's status, rather than relying on paper or memory checks.",
    metaDescription:
      "Comparing auto repair software UK garages use? Explore key features, cloud vs installed options, and tips to find the right fit. Learn more.",
    keywords: ["auto repair software", "vehicle repair software", "automotive repair system"],
    moreAbout: [
      { title: "Auto Repair Software UK", text: "UK garages rely on Repair Booking to manage bookings, monitor jobs and maintain customer records. It provides a clear system instead of jumbled paper, showing what's wrong and when. Customers can reserve their car online, alleviating the need for phone calls." },
      { title: "Vehicle Repair Software", text: "Repair Booking is vehicle repair software that helps you run your repair company efficiently. It combines bookings, job tracking and customer information into one easy solution. Where paper or spreadsheets were used, Repair Booking gives you a clear view of each repair job." },
      { title: "Vehicle Repair Shop Software", text: "Repair Booking is vehicle repair shop software designed to make your day-to-day work easier. It lets you keep a record of bookings, follow repairs, and maintain all your customers' details in a single location. With Repair Booking you won't use paper notes but have a clear view of the status of all jobs." },
      { title: "Auto Repair Shop Software", text: "Repair Booking is software designed specifically for auto repair shops to relieve the strain. It manages jobs, bookings and customer data within a single easy-to-use solution. No more missing papers or appointments." },
      { title: "Auto Repair Shop Programs", text: "Repair Booking is considered one of the best programs for handling the day-to-day activities of an auto repair shop. It combines bookings, customer records and job tracking into one convenient system. Instead of paper or several tools, Repair Booking provides a solid overview of each repair job." },
      { title: "Software Automotive Repair", text: "Repair Booking gives automotive repair companies a solution they can run their business on daily. It saves your staff time and reduces the calls you receive from people booking their cars in for repairs. Repair Booking also notifies and updates automatically, so the customer is always informed about the car's situation." },
      { title: "Auto Repair Software", text: "Repair Booking is auto repair software that makes running a repair business easy and stress-free. It keeps a record of jobs, manages bookings and holds customer records in one place. With a clear snapshot of repair status, Repair Booking removes the need to consult paper or rely on memory." },
      { title: "Auto Repair Computer Software", text: "Repair Booking is computer software designed for ease of auto repair. It integrates job tracking, bookings and customer records into a single streamlined solution. Forget paper files and forgotten information. With Repair Booking, customers can book repairs online, saving your staff time." },
      { title: "Automotive Software", text: "Repair Booking is automotive software made to help garages and repair shops operate more smoothly. It is a convenient system that integrates bookings, jobs and customer information. No more lost paperwork or confusion over who's doing what on a job." },
    ],
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
      "Repair Booking is a garage management system which performs everything in one solution. It can be used for scheduling appointments, monitoring vehicle maintenance, and more, making daily garage tasks easy. No lost paperwork, no missed calls – see which jobs are progressing, finished or waiting for customers.",
    metaDescription:
      "Choosing a garage management system? Discover the core features, pricing factors, and setup tips to run your workshop more efficiently. Explore now.",
    keywords: ["garage management software", "workshop management system", "auto shop management"],
    moreAbout: [
      { title: "Workshop Management Software UK", text: "Repair Booking is workshop management software for UK repair businesses, organising customers, staff and jobs without chaos. No more multiple notebooks or apps \u2013 it's all in one convenient system. See the work done and what is still to be done." },
    ],
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
      "Repair Booking (CDM software) is car dealership management software designed to organize and streamline your business. It integrates booking, customer information and job tracking in a single convenient platform. Elimination of lost paperwork or confused staffing.",
    metaDescription:
      "Looking for car dealership management software? See how it helps you track stock, manage sales, and cut daily paperwork. Explore Repair Booking today.",
    keywords: ["car dealership software", "dealership management system", "vehicle inventory software"],
    moreAbout: [
      { title: "Car Dealer Computer Software", text: "Repair Booking is car dealer computer software designed to help dealerships run their business easily. It manages bookings, customer information and vehicle service records in one system. With everything on a single platform, staff can locate information quickly instead of navigating spreadsheets or paper files." },
    ],
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
      "If you do repairs on mobile phones for a living, then you need Mobile Phone Repair Software like Repair Booking. It deals with all repairs, from the customer entering the door to taking the repaired phone home. Nothing gets overlooked with Repair Booking, which keeps track of parts, pricing and repair status.",
    metaDescription:
      "Find mobile phone repair software that streamlines bookings, tracks jobs, and saves time for busy repair shops. Explore Repair Booking today.",
    keywords: ["mobile repair shop software", "phone repair software", "repair shop management system"],
    moreAbout: [
      { title: "Repair Shop UK", text: "A repair shop in the UK can run more easily with Repair Booking. Whether you fix phones, laptops or gadgets, Repair Booking gives you one simple solution to oversee jobs, customers and payments. No more paper notes or spreadsheets \u2013 every repair is documented so nothing is lost." },
      { title: "Repair Shop Software", text: "Repair Booking is repair shop software designed to ease the everyday tasks of a repair shop. It manages jobs, organises bookings and keeps customer records in one place, with no need to wrestle with paper forms or keep things in your head. Customers can schedule visits online, which reduces staff time and phone calls." },
      { title: "Repair Management Software", text: "Repair Booking is repair management software that helps your business run smoother. It checks in every repair job from start to finish so nothing gets missed. Manage bookings, update customers and keep records in one place instead of juggling paperwork or losing jobs." },
    ],
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
      "With Repair Booking, online appointment booking is easy for you and your customers. Repair or service appointments can be made at a time convenient for them, including after hours, and your staff always know what is happening. Repair Booking also includes simple POS software: process payments, print receipts and view sales all from a single place.",
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
