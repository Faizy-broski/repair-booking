import {
  Compass,
  Store,
  Briefcase,
  UsersRound,
  Target,
  Receipt,
  ClipboardList,
  Zap,
  Package,
  Repeat,
  UserCog,
  Building2,
  LineChart,
  Palette,
  Plug,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Workflow,
  Mail,
  MessageSquare,
  CalendarClock,
  FileText,
  Layers,
  Gauge,
  Bell,
  Wrench,
  CreditCard,
  BarChart3,
  Sliders,
  Globe,
  Link2,
  Database,
  Truck,
  Tag,
  Star,
  Search,
} from "lucide-react";
import type { CapabilityPage } from "./types";

export const featurePages: CapabilityPage[] = [
  {
    slug: "why-irepairly",
    name: "Why iRepairly?",
    icon: Compass,
    kicker: "Platform Overview",
    tagline: "Built by people who understand repair workflows.",
    description:
      "Most business software is built for generic retail and bent into shape for repair shops. iRepairly starts from the repair workflow itself — intake, diagnosis, parts, labour, and pickup — and builds POS, inventory, and CRM around it, so every feature fits how repair businesses actually work.",
    metaDescription:
      "Discover why repair shops choose iRepairly: purpose-built ticketing, POS, and inventory tools designed around real repair workflows.",
    keywords: ["repair shop software", "why choose iRepairly", "repair management platform"],
    benefits: [
      { icon: Workflow, title: "Workflow-first design", desc: "Every screen maps to a real step in your repair process, not a generic retail template." },
      { icon: Clock, title: "Faster to run", desc: "Less clicking between disconnected tools — tickets, stock, and payments live in one place." },
      { icon: ShieldCheck, title: "Built for accountability", desc: "Full audit trails on tickets, payments, and stock movements protect your team and your customers." },
      { icon: CheckCircle2, title: "Grows with you", desc: "Start as a single counter and scale to multiple branches without switching platforms." },
    ],
    useCases: [
      { title: "Replacing spreadsheets", desc: "Move ticket tracking and stock counts out of spreadsheets and into one connected system." },
      { title: "Consolidating tools", desc: "Retire separate POS, CRM, and booking tools in favour of one login." },
      { title: "Standardising a multi-shop group", desc: "Give every location the same workflow, reporting, and customer experience." },
      { title: "Onboarding new staff faster", desc: "A guided, purpose-built interface means less training time for new hires." },
    ],
    faqs: [
      { question: "Is iRepairly only for phone repair shops?", answer: "No, it's used across many repair trades — see Business Types for the full list of supported industries." },
      { question: "How long does setup take?", answer: "Most shops are taking their first ticket within a day, with guided onboarding and data import support." },
      { question: "Can I try it before committing?", answer: "Yes, a free trial is available with no card required." },
    ],
    related: [
      { label: "All Features", href: "/features" },
      { label: "Business Types", href: "/features/business-types" },
      { label: "All Industries", href: "/industries" },
    ],
  },
  {
    slug: "business-types",
    name: "Business Types",
    icon: Store,
    kicker: "Who It's For",
    tagline: "One platform, configured for your specific trade.",
    description:
      "From mobile phone repair to jewellery restoration, iRepairly adapts its ticket fields, workflows, and terminology to match your trade. Whichever repair business you run, you can configure the platform to reflect exactly how your team works.",
    metaDescription:
      "See how iRepairly adapts to different repair business types — from electronics and mobile repair to bicycles, watches, and more.",
    keywords: ["repair business software", "business types", "industry-specific repair software"],
    benefits: [
      { icon: Sliders, title: "Configurable fields", desc: "Add custom intake fields relevant to your trade, from IMEI numbers to frame sizes." },
      { icon: Tag, title: "Custom terminology", desc: "Rename statuses and labels to match the language your team already uses." },
      { icon: Layers, title: "Trade-specific templates", desc: "Start from a template built for your industry instead of a blank setup." },
      { icon: Globe, title: "Multi-trade support", desc: "Run several service lines — like repairs and trade-ins — from one account." },
    ],
    useCases: [
      { title: "Electronics & mobile shops", desc: "Track IMEI, warranty status, and parts by device model." },
      { title: "Vehicle & bike shops", desc: "Capture make, model, and service history alongside repair notes." },
      { title: "Specialist trades", desc: "Configure fields for jewellery, watches, instruments, or sports equipment." },
      { title: "Mixed-service shops", desc: "Combine retail sales with repair intake under one roof." },
    ],
    faqs: [
      { question: "Can I configure fields myself?", answer: "Yes, custom fields can be added and reordered from settings without developer help." },
      { question: "Is there a template for my trade?", answer: "Most common repair trades have a starting template — see the Industries pages for details." },
      { question: "Can one account support multiple trades?", answer: "Yes, you can run multiple service categories from a single account and location." },
    ],
    related: [
      { label: "All Industries", href: "/industries" },
      { label: "Customization", href: "/features/customization" },
      { label: "Why Repair Pilot?", href: "/features/why-repair-pilot" },
    ],
  },
  {
    slug: "job-management",
    name: "Job Management",
    icon: Briefcase,
    kicker: "Workflow & Scheduling",
    tagline: "Keep every repair moving, in the right order.",
    description:
      "Job management in iRepairly gives your team a live view of every repair in the shop — who's working on what, what's overdue, and what's waiting on parts. Assign, prioritise, and reassign jobs without losing history or context.",
    metaDescription:
      "Manage repair jobs from intake to completion with status tracking, technician assignment, and prioritisation tools in iRepairly.",
    keywords: ["job management software", "repair workflow", "technician scheduling"],
    benefits: [
      { icon: Workflow, title: "Custom workflows", desc: "Define the exact stages a job passes through, matched to your process." },
      { icon: UsersRound, title: "Technician assignment", desc: "Assign jobs to individuals or teams and balance workload visually." },
      { icon: CalendarClock, title: "Priority queues", desc: "Flag urgent or overdue jobs so nothing important gets buried." },
      { icon: Bell, title: "Internal alerts", desc: "Notify staff automatically when a job is assigned, blocked, or overdue." },
    ],
    useCases: [
      { title: "Daily job board", desc: "Start each shift with a clear view of what's due and who's working on it." },
      { title: "Parts-blocked jobs", desc: "Automatically flag jobs waiting on backordered parts so they don't get forgotten." },
      { title: "Workload balancing", desc: "See technician queues at a glance and redistribute jobs before anyone is overloaded." },
      { title: "Multi-step repairs", desc: "Track complex jobs that move between diagnosis, repair, and quality check stages." },
    ],
    faqs: [
      { question: "Can I set custom job stages?", answer: "Yes, stages are fully configurable to match your shop's actual process." },
      { question: "Does it support job prioritisation?", answer: "Yes, jobs can be flagged as urgent and sorted by due date automatically." },
      { question: "Can technicians see only their own jobs?", answer: "Yes, permissions can restrict technicians to their assigned workload only." },
    ],
    related: [
      { label: "Tickets", href: "/product/tickets" },
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Automation", href: "/features/automation" },
    ],
  },
  {
    slug: "customer-crm",
    name: "Customer CRM",
    icon: UsersRound,
    kicker: "Customer Relationships",
    tagline: "Every customer's full history, one search away.",
    description:
      "iRepairly's CRM keeps every repair, purchase, and conversation tied to a single customer record. Front desk staff can see prior devices, warranty status, and communication history instantly, so every interaction feels personal and informed.",
    metaDescription:
      "A built-in CRM for repair shops — unified customer profiles with repair history, purchases, and communication logs.",
    keywords: ["repair shop CRM", "customer management software", "customer history tracking"],
    benefits: [
      { icon: Search, title: "Instant lookup", desc: "Find any customer by name, phone, email, or device in seconds." },
      { icon: Clock, title: "Full history", desc: "See every past repair, purchase, and note against a customer profile." },
      { icon: MessageSquare, title: "Communication log", desc: "Track SMS, email, and call notes in one thread per customer." },
      { icon: Star, title: "Customer segments", desc: "Group customers by loyalty, spend, or repair type for targeted outreach." },
    ],
    useCases: [
      { title: "Repeat customer service", desc: "Recognise returning customers instantly and reference their repair history." },
      { title: "Warranty lookups", desc: "Check a device's warranty status without digging through paper receipts." },
      { title: "Targeted follow-ups", desc: "Message customers whose repairs completed a week ago to check satisfaction." },
      { title: "Duplicate cleanup", desc: "Merge duplicate customer records to keep reporting accurate." },
    ],
    faqs: [
      { question: "Can I merge duplicate customer records?", answer: "Yes, a built-in merge tool consolidates duplicate profiles without losing history." },
      { question: "Does the CRM track communication?", answer: "Yes, SMS, email, and manual notes are logged against each customer automatically." },
      { question: "Can customers view their own history?", answer: "Yes, through the Customer Portal, customers can view their own repairs and invoices." },
    ],
    related: [
      { label: "Customer Portal", href: "/features/customer-portal" },
      { label: "Leads", href: "/features/leads" },
      { label: "Tickets", href: "/product/tickets" },
    ],
  },
  {
    slug: "leads",
    name: "Leads",
    icon: Target,
    kicker: "Sales Pipeline",
    tagline: "Turn enquiries into booked repairs.",
    description:
      "Capture enquiries from your website, phone, or walk-ins and track them through to a booked repair or sale. iRepairly's lead tracking keeps follow-ups organised so no potential customer is left waiting on a callback.",
    metaDescription:
      "Track repair enquiries and quotes from first contact to booked job with iRepairly's lead management tools.",
    keywords: ["repair shop leads", "sales pipeline software", "quote tracking"],
    benefits: [
      { icon: Target, title: "Pipeline view", desc: "See every enquiry by stage, from new lead to quoted to booked." },
      { icon: Bell, title: "Follow-up reminders", desc: "Never miss a callback with automatic follow-up reminders." },
      { icon: FileText, title: "Quote tracking", desc: "Send quotes and track whether they've been viewed or accepted." },
      { icon: BarChart3, title: "Conversion insights", desc: "See how many enquiries turn into bookings and where leads drop off." },
    ],
    useCases: [
      { title: "Website enquiries", desc: "Capture quote requests from your website directly into the pipeline." },
      { title: "Phone enquiries", desc: "Log a call-in enquiry and set a follow-up reminder in seconds." },
      { title: "Quote-to-booking", desc: "Convert an accepted quote directly into a repair ticket." },
      { title: "Lost lead review", desc: "Review why leads didn't convert to improve your quoting process." },
    ],
    faqs: [
      { question: "Can leads convert directly into tickets?", answer: "Yes, an accepted quote can be converted into a repair ticket in one click." },
      { question: "Does it remind staff to follow up?", answer: "Yes, follow-up reminders can be set manually or triggered automatically after inactivity." },
      { question: "Can I track where leads come from?", answer: "Yes, leads can be tagged by source, such as website, phone, or walk-in." },
    ],
    related: [
      { label: "Customer CRM", href: "/features/customer-crm" },
      { label: "Automation", href: "/features/automation" },
      { label: "Reporting", href: "/features/reporting" },
    ],
  },
  {
    slug: "invoicing-and-payments",
    name: "Invoicing & Payments",
    icon: Receipt,
    kicker: "Billing",
    tagline: "Get paid faster, with fewer manual steps.",
    description:
      "Generate professional invoices directly from repair tickets or sales, accept partial and split payments, and send automated payment reminders. iRepairly keeps your billing accurate and your cash flow predictable.",
    metaDescription:
      "Create invoices from repair tickets, accept flexible payments, and automate reminders with iRepairly's invoicing tools.",
    keywords: ["repair shop invoicing", "payment processing software", "billing automation"],
    benefits: [
      { icon: FileText, title: "One-click invoices", desc: "Generate an invoice directly from a completed ticket or sale." },
      { icon: CreditCard, title: "Flexible payments", desc: "Accept card, cash, split, and partial payments in one flow." },
      { icon: Bell, title: "Automated reminders", desc: "Send payment reminders automatically for overdue invoices." },
      { icon: ShieldCheck, title: "Audit-ready records", desc: "Every payment is logged with a clear, exportable audit trail." },
    ],
    useCases: [
      { title: "Repair invoicing", desc: "Bill parts and labour together the moment a repair is marked complete." },
      { title: "Deposits", desc: "Take a deposit at intake and collect the balance on pickup." },
      { title: "Recurring billing", desc: "Invoice repeat commercial customers on a set schedule." },
      { title: "Overdue follow-up", desc: "Automatically chase unpaid invoices without manual tracking." },
    ],
    faqs: [
      { question: "Can I take deposits on repairs?", answer: "Yes, partial payments can be taken at intake with the balance due on completion." },
      { question: "Does it support multiple payment methods?", answer: "Yes, including card, cash, and split payments across methods." },
      { question: "Can invoices be sent automatically?", answer: "Yes, invoices can be emailed automatically when a ticket or sale is completed." },
    ],
    related: [
      { label: "POS", href: "/product/pos" },
      { label: "Reporting", href: "/features/reporting" },
      { label: "Customer Portal", href: "/features/customer-portal" },
    ],
  },
  {
    slug: "worksheets",
    name: "Worksheets",
    icon: ClipboardList,
    kicker: "Diagnostics & Documentation",
    tagline: "Structured diagnostic checklists for every repair.",
    description:
      "Worksheets give technicians a consistent, structured way to record diagnostics, checklists, and condition notes for every job. Standardise how repairs are documented across your whole team, and keep a defensible record for every device that comes through the door.",
    metaDescription:
      "Standardise repair diagnostics with customisable worksheets and checklists built into every iRepairly ticket.",
    keywords: ["repair worksheets", "diagnostic checklist software", "repair documentation"],
    benefits: [
      { icon: ClipboardList, title: "Custom checklists", desc: "Build diagnostic checklists specific to device type or repair category." },
      { icon: FileText, title: "Condition notes", desc: "Record pre-existing damage with notes and photos before work begins." },
      { icon: CheckCircle2, title: "Quality checks", desc: "Require a final checklist sign-off before a job is marked ready for pickup." },
      { icon: ShieldCheck, title: "Liability protection", desc: "Documented condition and diagnostics protect your shop from disputes." },
    ],
    useCases: [
      { title: "Intake diagnostics", desc: "Run a standard checklist to catch pre-existing damage before repair begins." },
      { title: "Repair sign-off", desc: "Require technicians to complete a quality checklist before closing a ticket." },
      { title: "Device-specific checks", desc: "Use different worksheets for phones, laptops, or specialist equipment." },
      { title: "Training consistency", desc: "New technicians follow the same checklist as experienced staff from day one." },
    ],
    faqs: [
      { question: "Can worksheets differ by device type?", answer: "Yes, you can create multiple worksheet templates and assign them by category." },
      { question: "Can I require sign-off before closing a ticket?", answer: "Yes, worksheets can be set as mandatory before a ticket can move to the next stage." },
      { question: "Are worksheets stored with the ticket?", answer: "Yes, completed worksheets stay attached to the ticket permanently for reference." },
    ],
    related: [
      { label: "Job Management", href: "/features/job-management" },
      { label: "Tickets", href: "/product/tickets" },
      { label: "Customization", href: "/features/customization" },
    ],
  },
  {
    slug: "automation",
    name: "Automation",
    icon: Zap,
    kicker: "Workflow Automation",
    tagline: "Let the routine work happen on its own.",
    description:
      "iRepairly automates the repetitive parts of running a repair shop — status update messages, follow-up reminders, low-stock alerts, and review requests — so your team can focus on the work that actually needs a human.",
    metaDescription:
      "Automate customer updates, follow-ups, and stock alerts with iRepairly's workflow automation tools for repair shops.",
    keywords: ["repair shop automation", "workflow automation software", "automated notifications"],
    benefits: [
      { icon: Bell, title: "Trigger-based alerts", desc: "Fire notifications automatically when a ticket status or stock level changes." },
      { icon: MessageSquare, title: "Automated messaging", desc: "Send SMS and email updates without staff touching a keyboard." },
      { icon: CalendarClock, title: "Scheduled follow-ups", desc: "Automatically request reviews or check in with customers days after pickup." },
      { icon: Workflow, title: "Custom rules", desc: "Build if-this-then-that rules tailored to your shop's own workflow." },
    ],
    useCases: [
      { title: "Status notifications", desc: "Message customers automatically the moment their repair is ready." },
      { title: "Low-stock alerts", desc: "Notify managers automatically when key parts fall below reorder level." },
      { title: "Review requests", desc: "Ask happy customers for a review a few days after a completed repair." },
      { title: "Abandoned quote follow-up", desc: "Nudge customers who haven't responded to a quote after a set number of days." },
    ],
    faqs: [
      { question: "Can I build my own automation rules?", answer: "Yes, custom triggers and actions can be configured without any code." },
      { question: "Will automated messages sound robotic?", answer: "No, message templates are fully editable so they match your shop's tone." },
      { question: "Can automations be turned off per customer?", answer: "Yes, individual customers can opt out of automated messaging at any time." },
    ],
    related: [
      { label: "AI co-pilot", href: "/product/ai-co-pilot" },
      { label: "Leads", href: "/features/leads" },
      { label: "Integrations", href: "/features/integrations" },
    ],
  },
  {
    slug: "stock-management",
    name: "Stock Management",
    icon: Package,
    kicker: "Inventory Control",
    tagline: "Precise stock counts without the manual counting.",
    description:
      "Stock management in iRepairly covers everything from receiving purchase orders to running cycle counts, so your parts inventory stays accurate without pulling a technician off the bench to count shelves.",
    metaDescription:
      "Track stock levels, run cycle counts, and manage purchase orders with iRepairly's stock management tools for repair shops.",
    keywords: ["stock management software", "repair parts inventory", "cycle counts"],
    benefits: [
      { icon: Package, title: "Real-time levels", desc: "Stock counts update instantly with every sale, repair, and return." },
      { icon: Truck, title: "Purchase orders", desc: "Raise, send, and receive purchase orders directly against supplier records." },
      { icon: CheckCircle2, title: "Cycle counts", desc: "Run partial or full stock takes with automatic variance reporting." },
      { icon: Bell, title: "Reorder alerts", desc: "Set reorder points so you're notified before a part runs out." },
    ],
    useCases: [
      { title: "Supplier ordering", desc: "Generate a purchase order automatically when stock hits a reorder threshold." },
      { title: "Damaged stock write-offs", desc: "Record damaged or written-off stock with a reason code for reporting." },
      { title: "Multi-location transfers", desc: "Move stock between branches with a full transfer audit trail." },
      { title: "Seasonal stock takes", desc: "Run a full inventory count at year-end with variance reports ready for accounting." },
    ],
    faqs: [
      { question: "Does it support purchase orders?", answer: "Yes, purchase orders can be created, sent to suppliers, and received into stock." },
      { question: "Can I run partial stock counts?", answer: "Yes, cycle counts can target specific categories or locations instead of a full count." },
      { question: "Are stock movements logged?", answer: "Yes, every adjustment, sale, and transfer is logged with a timestamp and user." },
    ],
    related: [
      { label: "Inventory", href: "/product/inventory" },
      { label: "Trade/Buy In Items", href: "/features/trade-buy-in-items" },
      { label: "Reporting", href: "/features/reporting" },
    ],
  },
  {
    slug: "trade-buy-in-items",
    name: "Trade/Buy In Items",
    icon: Repeat,
    kicker: "Trade-Ins & Buybacks",
    tagline: "Buy, grade, and resell used devices with confidence.",
    description:
      "Manage trade-ins and buybacks from offer to resale. Record device condition, calculate offers, and move accepted trade-ins straight into resale inventory — all tracked alongside your repair and retail operations.",
    metaDescription:
      "Manage trade-in and buyback devices from offer to resale with iRepairly's trade-in tracking tools.",
    keywords: ["device trade-in software", "buyback management", "used device inventory"],
    benefits: [
      { icon: Repeat, title: "Offer calculator", desc: "Generate consistent trade-in offers based on condition and model." },
      { icon: ClipboardList, title: "Condition grading", desc: "Record grading notes and photos at the point of intake." },
      { icon: Package, title: "Resale pipeline", desc: "Move accepted trade-ins directly into sellable inventory." },
      { icon: ShieldCheck, title: "ID & compliance capture", desc: "Record seller details to support second-hand goods compliance." },
    ],
    useCases: [
      { title: "In-store trade-ins", desc: "Grade a device, generate an offer, and pay out in one counter transaction." },
      { title: "Refurbishment pipeline", desc: "Route traded-in devices through repair before they hit resale stock." },
      { title: "Resale listing", desc: "Move graded devices straight into POS-ready inventory with pricing." },
      { title: "Compliance recordkeeping", desc: "Keep seller ID and transaction records for regulatory requirements." },
    ],
    faqs: [
      { question: "Can traded-in devices go through repair first?", answer: "Yes, trade-ins can be routed into a repair ticket before being listed for resale." },
      { question: "Does it help with second-hand goods compliance?", answer: "Yes, seller details and transaction records can be captured at intake." },
      { question: "Can I set my own offer pricing rules?", answer: "Yes, offer calculations can be based on your own condition and model pricing tables." },
    ],
    related: [
      { label: "Inventory", href: "/product/inventory" },
      { label: "Stock Management", href: "/features/stock-management" },
      { label: "POS", href: "/product/pos" },
    ],
  },
  {
    slug: "customer-portal",
    name: "Customer Portal",
    icon: UserCog,
    kicker: "Self-Service",
    tagline: "Let customers check status without calling you.",
    description:
      "The Customer Portal gives your customers a self-service way to track repair status, view invoices, and approve quotes online — cutting down status-check calls and giving your front desk more time for in-person customers.",
    metaDescription:
      "Give customers self-service repair tracking, invoice access, and quote approvals with iRepairly's Customer Portal.",
    keywords: ["customer self-service portal", "repair status tracking", "online quote approval"],
    benefits: [
      { icon: Gauge, title: "Live status tracking", desc: "Customers see real-time repair status without calling the shop." },
      { icon: FileText, title: "Invoice access", desc: "Customers can view and download past invoices anytime." },
      { icon: CheckCircle2, title: "Online quote approval", desc: "Customers approve or decline quotes remotely, speeding up turnaround." },
      { icon: ShieldCheck, title: "Secure access", desc: "Portal access is scoped to each customer's own data only." },
    ],
    useCases: [
      { title: "Status check reduction", desc: "Cut down phone calls by letting customers self-check repair progress." },
      { title: "Remote quote approval", desc: "Send a quote and let the customer approve it from their phone." },
      { title: "Invoice history", desc: "Give repeat customers easy access to past invoices for expense claims." },
      { title: "Branded experience", desc: "Present the portal under your own shop branding and domain." },
    ],
    faqs: [
      { question: "Do customers need an app to use the portal?", answer: "No, the portal works entirely in the browser on any device." },
      { question: "Can customers approve quotes online?", answer: "Yes, customers can review and approve or decline quotes directly through the portal." },
      { question: "Is the portal branded to my shop?", answer: "Yes, the portal can be styled with your shop's logo and colours." },
    ],
    related: [
      { label: "Customer CRM", href: "/features/customer-crm" },
      { label: "Invoicing & Payments", href: "/features/invoicing-and-payments" },
      { label: "Tickets", href: "/product/tickets" },
    ],
  },
  {
    slug: "multiple-stores-locations",
    name: "Multiple Stores/Locations",
    icon: Building2,
    kicker: "Multi-Branch Operations",
    tagline: "Run every branch from one account.",
    description:
      "Manage staff, stock, and reporting across multiple branches from a single iRepairly account. Keep each location's data separate where it should be, and unified where it matters — like group-wide reporting and customer records.",
    metaDescription:
      "Manage multi-branch repair shop operations with per-location inventory, staff, and reporting in one iRepairly account.",
    keywords: ["multi-branch software", "multi-location POS", "franchise repair software"],
    benefits: [
      { icon: Building2, title: "Per-branch stock", desc: "Each location manages its own inventory with the option to transfer between sites." },
      { icon: UsersRound, title: "Branch-level staffing", desc: "Assign staff and permissions per location while managing them centrally." },
      { icon: BarChart3, title: "Group reporting", desc: "Compare performance across all branches from a single dashboard." },
      { icon: Globe, title: "Shared customer records", desc: "Customers are recognised across branches, not siloed per location." },
    ],
    useCases: [
      { title: "Franchise operations", desc: "Give franchisees their own branch data while owners see the full group view." },
      { title: "Stock transfers", desc: "Move parts between branches to fulfil an urgent repair without a new order." },
      { title: "Central reporting", desc: "Review revenue and turnaround across every location from one login." },
      { title: "Consistent pricing", desc: "Set group-wide pricing with per-branch overrides where needed." },
    ],
    faqs: [
      { question: "Can each branch have its own pricing?", answer: "Yes, pricing can be set centrally with per-branch overrides where needed." },
      { question: "Can staff work across multiple branches?", answer: "Yes, staff accounts can be granted access to one or several locations." },
      { question: "Is reporting available per branch and combined?", answer: "Yes, reports can be filtered per branch or viewed combined across the whole group." },
    ],
    related: [
      { label: "Analytics", href: "/product/analytics" },
      { label: "Reporting", href: "/features/reporting" },
      { label: "Integrations", href: "/features/integrations" },
    ],
  },
  {
    slug: "reporting",
    name: "Reporting",
    icon: LineChart,
    kicker: "Business Reporting",
    tagline: "Numbers that hold still long enough to act on.",
    description:
      "iRepairly's reporting tools cover sales, repairs, inventory, and staff performance, with exportable data for accountants and stakeholders. Filter by date, branch, or category to get exactly the view you need.",
    metaDescription:
      "Generate sales, repair, inventory, and staff performance reports with iRepairly's reporting tools for repair shops.",
    keywords: ["repair shop reporting", "business reports software", "financial reporting"],
    benefits: [
      { icon: LineChart, title: "Custom date ranges", desc: "Filter any report by day, week, month, or custom range." },
      { icon: FileText, title: "Exportable data", desc: "Export to CSV or PDF for your accountant or investors." },
      { icon: BarChart3, title: "Category breakdowns", desc: "See performance by service category, part type, or technician." },
      { icon: Building2, title: "Branch filtering", desc: "Drill into a single branch or roll up the entire group." },
    ],
    useCases: [
      { title: "Month-end close", desc: "Pull revenue and expense reports ready for bookkeeping in minutes." },
      { title: "Technician commission", desc: "Calculate commission payouts based on completed job reports." },
      { title: "Inventory valuation", desc: "Get a current stock valuation report for accounting purposes." },
      { title: "Investor updates", desc: "Export clean, exportable summaries for stakeholder reporting." },
    ],
    faqs: [
      { question: "Can reports be scheduled to send automatically?", answer: "Yes, key reports can be scheduled to email to managers on a set cadence." },
      { question: "Can I build custom reports?", answer: "Yes, custom filters let you build a report view specific to your needs." },
      { question: "Do reports include historical data?", answer: "Yes, full historical data is retained and reportable from day one." },
    ],
    related: [
      { label: "Analytics", href: "/product/analytics" },
      { label: "Multiple Stores/Locations", href: "/features/multiple-stores-locations" },
      { label: "Invoicing & Payments", href: "/features/invoicing-and-payments" },
    ],
  },
  {
    slug: "customization",
    name: "Customization",
    icon: Palette,
    kicker: "Configuration",
    tagline: "Shaped to fit your shop, not the other way round.",
    description:
      "From custom ticket fields to branded invoices and portal styling, iRepairly is built to be configured around your business rather than forcing you into a fixed workflow.",
    metaDescription:
      "Customise fields, workflows, branding, and templates to match your repair shop with iRepairly's configuration tools.",
    keywords: ["configurable repair software", "custom fields", "white-label repair software"],
    benefits: [
      { icon: Sliders, title: "Custom fields", desc: "Add fields to tickets, customers, or inventory specific to your trade." },
      { icon: Palette, title: "Branded documents", desc: "Style invoices, quotes, and the customer portal with your own branding." },
      { icon: Workflow, title: "Configurable workflows", desc: "Define your own ticket stages, statuses, and automation rules." },
      { icon: Tag, title: "Custom terminology", desc: "Rename labels throughout the platform to match your team's language." },
    ],
    useCases: [
      { title: "Branded customer documents", desc: "Send invoices and quotes that look like they came from your own design team." },
      { title: "Trade-specific intake", desc: "Add custom fields relevant to your device or repair category." },
      { title: "Multi-brand groups", desc: "Apply different branding per location within the same account." },
      { title: "Workflow tuning", desc: "Adjust ticket stages as your process evolves, without vendor tickets." },
    ],
    faqs: [
      { question: "Can I white-label the customer portal?", answer: "Yes, the portal and customer-facing documents can carry your own branding." },
      { question: "Do custom fields require a developer?", answer: "No, custom fields are managed directly in settings by shop admins." },
      { question: "Can different branches have different branding?", answer: "Yes, multi-branch accounts can apply branding per location." },
    ],
    related: [
      { label: "Business Types", href: "/features/business-types" },
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Integrations", href: "/features/integrations" },
    ],
  },
  {
    slug: "integrations",
    name: "Integrations",
    icon: Plug,
    kicker: "Connected Tools",
    tagline: "Fit into the stack you already run.",
    description:
      "Connect iRepairly to the payment processors, accounting software, and communication tools your shop already relies on. Sync data automatically instead of re-entering it across systems.",
    metaDescription:
      "Connect iRepairly with payment, accounting, and communication tools through built-in integrations and an open API.",
    keywords: ["repair software integrations", "API access", "third-party connections"],
    benefits: [
      { icon: CreditCard, title: "Payment processors", desc: "Connect to leading card and online payment providers directly." },
      { icon: Database, title: "Accounting sync", desc: "Push sales and expense data into your accounting software automatically." },
      { icon: Link2, title: "Open API", desc: "Build custom connections with iRepairly's documented API." },
      { icon: MessageSquare, title: "Communication tools", desc: "Connect SMS and email providers for automated customer messaging." },
    ],
    useCases: [
      { title: "Accounting automation", desc: "Sync daily sales totals into your accounting platform without manual entry." },
      { title: "Custom reporting", desc: "Pull raw data via API into your own dashboards or data warehouse." },
      { title: "Marketing tools", desc: "Sync customer lists to email marketing platforms for campaigns." },
      { title: "Hardware integrations", desc: "Connect receipt printers, cash drawers, and card readers." },
    ],
    faqs: [
      { question: "Is there a public API?", answer: "Yes, a documented REST API is available — see the API resource page for details." },
      { question: "Does it integrate with accounting software?", answer: "Yes, common accounting platforms can be connected for automatic data sync." },
      { question: "Can I build a custom integration?", answer: "Yes, the open API supports custom integrations for teams with development resources." },
    ],
    related: [
      { label: "API", href: "/resources/api" },
      { label: "Automation", href: "/features/automation" },
      { label: "Docs", href: "/resources/docs" },
    ],
  },
];
