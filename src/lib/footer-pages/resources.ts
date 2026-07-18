import {
  BookOpen,
  Code2,
  History,
  Activity,
  ShieldCheck,
  LifeBuoy,
  HelpCircle,
  Newspaper,
  ArrowRightLeft,
  Award,
  MessageCircleQuestion,
  Map,
} from "lucide-react";
import type { ResourcePage } from "./types";

export const resourcePages: ResourcePage[] = [
  {
    slug: "docs",
    name: "Docs",
    icon: BookOpen,
    kicker: "Documentation",
    tagline: "Everything you need to set up and run iRepairly.",
    description:
      "Our documentation covers account setup, tickets, POS, inventory, and every module in the platform, with step-by-step guides for common workflows.",
    metaDescription:
      "Browse iRepairly's documentation for setup guides, feature walkthroughs, and workflow references.",
    keywords: ["iRepairly docs", "documentation", "setup guides"],
    sections: [
      {
        heading: "Getting started",
        body: [
          "New to iRepairly? Start with account setup, adding your first location, and configuring your ticket workflow before importing existing customer and inventory data.",
        ],
      },
      {
        heading: "Core modules",
        body: [
          "Detailed guides cover Tickets, POS, Inventory, Analytics, and the AI co-pilot, along with every feature module from Job Management to Integrations.",
        ],
      },
      {
        heading: "Admin & configuration",
        body: [
          "Learn how to configure custom fields, branding, staff permissions, and multi-branch settings to match how your business operates.",
        ],
      },
    ],
    faqs: [
      { question: "Is the documentation free to access?", answer: "Yes, documentation is available to all customers and prospective customers at no cost." },
      { question: "Is there a search function?", answer: "Yes, docs are searchable so you can jump directly to the topic you need." },
    ],
    related: [
      { label: "API", href: "/resources/api" },
      { label: "Help Centre", href: "/resources/help-centre" },
      { label: "Support", href: "/resources/support" },
    ],
  },
  {
    slug: "api",
    name: "API",
    icon: Code2,
    kicker: "Developer Resources",
    tagline: "Build custom integrations on top of iRepairly.",
    description:
      "iRepairly's REST API lets you read and write tickets, inventory, customers, and reporting data, so you can build custom integrations, automations, or reporting tools tailored to your business.",
    metaDescription:
      "Explore iRepairly's REST API documentation for building custom integrations and automations.",
    keywords: ["iRepairly API", "developer documentation", "REST API"],
    sections: [
      {
        heading: "Authentication",
        body: [
          "API access is authenticated with scoped API keys generated from your account settings, allowing you to control exactly what data an integration can read or write.",
        ],
      },
      {
        heading: "Core endpoints",
        body: [
          "Endpoints are available for tickets, customers, inventory, invoices, and reporting, with consistent pagination and filtering across the API.",
        ],
      },
      {
        heading: "Rate limits & support",
        body: [
          "Standard rate limits apply to keep the platform performant for all customers. Higher limits are available for approved integration partners on request.",
        ],
      },
    ],
    faqs: [
      { question: "Is the API available on all plans?", answer: "API access availability depends on your subscription plan — check your account settings for details." },
      { question: "Are webhooks supported?", answer: "Yes, webhooks are available for key events such as ticket status changes and completed sales." },
    ],
    related: [
      { label: "Docs", href: "/resources/docs" },
      { label: "Integrations", href: "/features/integrations" },
      { label: "Changelog", href: "/resources/changelog" },
    ],
    aliases: ["API"],
  },
  {
    slug: "changelog",
    name: "Changelog",
    icon: History,
    kicker: "Product Updates",
    tagline: "What's new in iRepairly, release by release.",
    description:
      "Track every product update, improvement, and fix as we ship them. The changelog is the fastest way to see what's changed since you last logged in.",
    metaDescription:
      "See the latest iRepairly product updates, new features, and improvements in our changelog.",
    keywords: ["iRepairly changelog", "product updates", "release notes"],
    sections: [
      {
        heading: "Recent releases",
        body: [
          "This is placeholder content. Release notes covering new features, improvements, and fixes will appear here in reverse chronological order as they ship.",
        ],
      },
      {
        heading: "How we ship",
        body: [
          "We release improvements continuously rather than in large, infrequent batches, so the changelog reflects a steady stream of smaller updates.",
        ],
      },
    ],
    related: [
      { label: "Development Roadmap", href: "/resources/development-roadmap" },
      { label: "Status", href: "/resources/status" },
      { label: "Docs", href: "/resources/docs" },
    ],
    aliases: ["Changelog", "Change log"],
  },
  {
    slug: "status",
    name: "Status",
    icon: Activity,
    kicker: "System Status",
    tagline: "Real-time platform status and uptime history.",
    description:
      "Check the current operational status of iRepairly's core services, including POS, ticketing, and the API, along with historical uptime and incident reports.",
    metaDescription:
      "View real-time system status, uptime, and incident history for the iRepairly platform.",
    keywords: ["iRepairly status", "platform uptime", "system status page"],
    sections: [
      {
        heading: "Current status",
        body: [
          "This is placeholder content. A live status indicator for core services — POS, ticketing, inventory, API, and the customer portal — will appear here.",
        ],
      },
      {
        heading: "Incident history",
        body: [
          "Past incidents, their impact, and resolution timelines are logged here for transparency, along with scheduled maintenance windows.",
        ],
      },
    ],
    related: [
      { label: "Security", href: "/resources/security" },
      { label: "Support", href: "/resources/support" },
      { label: "Changelog", href: "/resources/changelog" },
    ],
    aliases: ["Status", "Platform Status"],
  },
  {
    slug: "security",
    name: "Security",
    icon: ShieldCheck,
    kicker: "Trust & Security",
    tagline: "How we keep your business and customer data safe.",
    description:
      "Security is foundational to how iRepairly is built, from encrypted data storage to strict access controls and regular security reviews.",
    metaDescription:
      "Learn about iRepairly's approach to data security, encryption, and access controls.",
    keywords: ["iRepairly security", "data protection", "platform security"],
    sections: [
      {
        heading: "Data protection",
        body: [
          "Data is encrypted in transit and at rest, with access strictly limited to systems and personnel that require it to operate the platform.",
        ],
      },
      {
        heading: "Access controls",
        body: [
          "Role-based permissions let you control exactly what each staff member can see and do within your account, reducing the risk of accidental or unauthorised changes.",
        ],
      },
      {
        heading: "Ongoing review",
        body: [
          "We continually review our security practices as the platform evolves, and welcome responsible disclosure of any potential vulnerabilities.",
        ],
      },
    ],
    faqs: [
      { question: "Is customer data encrypted?", answer: "Yes, data is encrypted both in transit and at rest." },
      { question: "How do I report a security concern?", answer: "Please reach out via Contact Us and mark your message as a security disclosure." },
    ],
    related: [
      { label: "Privacy Policy", href: "/company/privacy-policy" },
      { label: "Data Processing Agreement", href: "/company/data-processing-agreement" },
      { label: "Status", href: "/resources/status" },
    ],
  },
  {
    slug: "support",
    name: "Support",
    icon: LifeBuoy,
    kicker: "Customer Support",
    tagline: "Real help, when you need it.",
    description:
      "Our support team helps customers troubleshoot issues, answer configuration questions, and get the most out of the platform.",
    metaDescription:
      "Get in touch with iRepairly's support team for help with your account, setup, or troubleshooting.",
    keywords: ["iRepairly support", "customer support", "help with repair software"],
    sections: [
      {
        heading: "How to reach support",
        body: [
          "Support is available through in-app chat and email for all customers, with priority support available on select plans.",
        ],
      },
      {
        heading: "Before you contact us",
        body: [
          "Check the Help Centre and Docs first — many common questions are answered there instantly, without needing to wait for a reply.",
        ],
      },
    ],
    faqs: [
      { question: "What are your support hours?", answer: "Standard support is available during business hours, with priority options for extended coverage." },
      { question: "Do you offer onboarding support?", answer: "Yes, new accounts receive guided onboarding to help with initial setup and data import." },
    ],
    related: [
      { label: "Help Centre", href: "/resources/help-centre" },
      { label: "Docs", href: "/resources/docs" },
      { label: "FAQ", href: "/resources/faq" },
    ],
  },
  {
    slug: "help-centre",
    name: "Help Centre",
    icon: HelpCircle,
    kicker: "Self-Service Help",
    tagline: "Find answers without waiting on a reply.",
    description:
      "The Help Centre brings together how-to guides, troubleshooting articles, and frequently asked questions in one searchable place.",
    metaDescription:
      "Search iRepairly's Help Centre for how-to guides, troubleshooting tips, and answers to common questions.",
    keywords: ["iRepairly help centre", "help articles", "troubleshooting guides"],
    sections: [
      {
        heading: "Popular topics",
        body: [
          "This is placeholder content. Popular articles covering account setup, billing, tickets, and inventory will be surfaced here based on what customers search for most.",
        ],
      },
      {
        heading: "Can't find an answer?",
        body: [
          "If an article doesn't solve your issue, our Support team is on hand to help directly.",
        ],
      },
    ],
    related: [
      { label: "Support", href: "/resources/support" },
      { label: "FAQ", href: "/resources/faq" },
      { label: "Docs", href: "/resources/docs" },
    ],
  },
  {
    slug: "blog",
    name: "Blog",
    icon: Newspaper,
    kicker: "Insights & Updates",
    tagline: "Ideas and advice for running a modern repair business.",
    description:
      "Our blog covers practical advice for running a repair shop — from inventory management to customer retention — alongside product news and industry trends.",
    metaDescription:
      "Read the iRepairly blog for advice on running a repair business, industry trends, and product updates.",
    keywords: ["repair shop blog", "repair business advice", "industry insights"],
    sections: [
      {
        heading: "Latest articles",
        body: [
          "This is placeholder content. Articles on operations, marketing, and industry trends for repair businesses will be published here.",
        ],
      },
      {
        heading: "Topics we cover",
        body: [
          "Expect coverage of inventory best practices, customer communication, staff management, and how repair businesses are using automation and AI day to day.",
        ],
      },
    ],
    related: [
      { label: "Case Studies", href: "/resources/case-studies" },
      { label: "Press", href: "/company/press" },
      { label: "Docs", href: "/resources/docs" },
    ],
  },
  {
    slug: "migrations",
    name: "Migrations",
    icon: ArrowRightLeft,
    kicker: "Switching to iRepairly",
    tagline: "Move your data over without losing anything.",
    description:
      "Switching from another system? We help you import your existing customers, tickets, inventory, and invoice history so your team can keep working with minimal disruption.",
    metaDescription:
      "Learn how iRepairly helps repair businesses migrate customer, inventory, and repair data from their previous system.",
    keywords: ["repair software migration", "data import", "switching repair software"],
    sections: [
      {
        heading: "What we help migrate",
        body: [
          "Customer records, repair history, inventory counts, and invoice data can typically be imported from your previous system or a spreadsheet export.",
        ],
      },
      {
        heading: "Migration process",
        body: [
          "Our team reviews your existing data format, maps it to iRepairly's structure, and runs the import with you before go-live so you can verify everything looks right.",
        ],
      },
    ],
    faqs: [
      { question: "Do I need to migrate everything at once?", answer: "No, historical data can often be imported gradually alongside a phased go-live." },
      { question: "What if my previous system doesn't support exports?", answer: "Our team can advise on alternative approaches, including manual or spreadsheet-based imports." },
    ],
    related: [
      { label: "Docs", href: "/resources/docs" },
      { label: "Support", href: "/resources/support" },
      { label: "Why iRepairly?", href: "/features/why-irepairly" },
    ],
  },
  {
    slug: "case-studies",
    name: "Case Studies",
    icon: Award,
    kicker: "Customer Stories",
    tagline: "How real repair businesses use iRepairly.",
    description:
      "See how repair shops across different trades and sizes use iRepairly to run their day-to-day operations, streamline workflows, and grow.",
    metaDescription:
      "Read case studies of repair businesses using iRepairly to manage tickets, inventory, and multi-branch operations.",
    keywords: ["iRepairly case studies", "customer stories", "repair shop success stories"],
    sections: [
      {
        heading: "Featured stories",
        body: [
          "This is placeholder content. Detailed case studies covering specific shops, their challenges, and results after adopting iRepairly will be published here.",
        ],
      },
    ],
    related: [
      { label: "Customers", href: "/company/customers" },
      { label: "Blog", href: "/resources/blog" },
      { label: "All Industries", href: "/industries" },
    ],
  },
  {
    slug: "faq",
    name: "FAQ",
    icon: MessageCircleQuestion,
    kicker: "Frequently Asked Questions",
    tagline: "Quick answers to common questions about iRepairly.",
    description:
      "Answers to the questions we hear most often from shops evaluating or using iRepairly, covering setup, pricing, data, and features.",
    metaDescription:
      "Find answers to frequently asked questions about iRepairly's features, pricing, setup, and data handling.",
    keywords: ["iRepairly FAQ", "frequently asked questions", "repair software questions"],
    sections: [
      {
        heading: "Getting started",
        body: [
          "Most shops can be up and running within a day, with guided onboarding and support for importing existing data.",
        ],
      },
    ],
    faqs: [
      { question: "Do we need to migrate from our current system?", answer: "No heavy migration is required. We help you import your existing customer, repair, inventory, and invoice data so your team can continue working with minimal disruption." },
      { question: "Is hardware included?", answer: "Hardware is optional. You can use your existing devices, or we can recommend compatible printers, barcode scanners, and POS equipment based on your shop setup." },
      { question: "What happens to my data if I leave?", answer: "Your data remains yours. You can export your customers, tickets, invoices, and reports whenever you need." },
      { question: "Can the AI co-pilot make mistakes?", answer: "Yes. AI provides recommendations, but important decisions should always be reviewed by your team before they are finalised." },
    ],
    related: [
      { label: "Help Centre", href: "/resources/help-centre" },
      { label: "Support", href: "/resources/support" },
      { label: "Docs", href: "/resources/docs" },
    ],
  },
  {
    slug: "development-roadmap",
    name: "Development Roadmap",
    icon: Map,
    kicker: "What's Next",
    tagline: "See what we're building, before it ships.",
    description:
      "Our roadmap gives visibility into upcoming features and improvements, shaped directly by feedback from repair shops using the platform.",
    metaDescription:
      "See what's coming next for iRepairly on our public development roadmap.",
    keywords: ["iRepairly roadmap", "upcoming features", "product roadmap"],
    sections: [
      {
        heading: "In progress",
        body: [
          "This is placeholder content. Features currently in active development will be listed here with expected timelines where available.",
        ],
      },
      {
        heading: "Planned",
        body: [
          "Longer-term ideas under consideration are listed separately, reflecting direction rather than committed timelines.",
        ],
      },
      {
        heading: "Shipped",
        body: [
          "Once a roadmap item ships, it moves to the Changelog, so you can always trace an idea from proposal to release.",
        ],
      },
    ],
    related: [
      { label: "Changelog", href: "/resources/changelog" },
      { label: "Blog", href: "/resources/blog" },
      { label: "FAQ", href: "/resources/faq" },
    ],
  },
];
