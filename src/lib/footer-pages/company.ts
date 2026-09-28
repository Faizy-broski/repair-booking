import { Building2, Heart, Briefcase, Newspaper, Mail } from "lucide-react";
import type { CompanyPage } from "./types";

export const companyPages: CompanyPage[] = [
  {
    slug: "about",
    name: "About",
    icon: Building2,
    kicker: "Our Story",
    tagline: "The operating system for repair businesses that take their craft seriously.",
    description:
      "iRepairly was built to give repair businesses the same operational polish that modern retail and hospitality brands take for granted — without forcing them into software that wasn't designed for repair work.",
    metaDescription:
      "Learn about iRepairly's mission to build the operating system for modern repair businesses worldwide.",
    keywords: ["about iRepairly", "repair software company", "company mission"],
    sections: [
      {
        heading: "Why we started",
        body: [
          "Repair businesses have always been underserved by software. Most tools on the market are either generic retail POS systems retrofitted with a 'repairs' tab, or clunky legacy platforms that haven't meaningfully changed in a decade.",
          "We started iRepairly to build something different: a platform designed from the ground up around the repair workflow — intake, diagnosis, parts, labour, and pickup — with the polish and reliability that modern businesses expect from their software.",
        ],
      },
      {
        heading: "What we believe",
        body: [
          "We believe repair shops deserve software that respects their craft. That means fast, intuitive tools that get out of the way, transparent pricing, and a genuine commitment to keeping customer data safe and portable.",
          "We also believe in building close to our customers. Product decisions are shaped directly by feedback from shop owners and technicians using the platform every day, across dozens of repair trades.",
        ],
      },
      {
        heading: "Where we're headed",
        body: [
          "Today, iRepairly supports repair businesses across electronics, vehicles, sporting goods, and specialist trades in multiple countries. We're continuing to invest in automation, AI-assisted workflows, and deeper reporting so every shop — from a single counter to a multi-branch group — can run with confidence.",
        ],
      },
    ],
    related: [
      { label: "Customers", href: "/company/customers" },
      { label: "Careers", href: "/company/careers" },
      { label: "Contact Us", href: "/company/contact-us" },
    ],
  },
  {
    slug: "customers",
    name: "Customers",
    icon: Heart,
    kicker: "Who We Serve",
    tagline: "Repair businesses of every size and trade, worldwide.",
    description:
      "From single-counter mobile phone repair shops to multi-branch electronics and vehicle service groups, repair businesses choose iRepairly to run their day-to-day operations.",
    metaDescription:
      "See the kinds of repair businesses that run on iRepairly, from independent shops to multi-branch groups.",
    keywords: ["iRepairly customers", "repair shop case studies", "who uses iRepairly"],
    sections: [
      {
        heading: "Independent shops",
        body: [
          "Single-location repair shops use iRepairly to replace spreadsheets and paper tickets with a connected system covering intake, POS, and inventory — often going live within a day.",
        ],
      },
      {
        heading: "Multi-branch groups",
        body: [
          "Growing repair businesses with several locations rely on iRepairly's multi-branch tools to standardise workflows, centralise reporting, and give owners visibility across every site without extra admin overhead.",
        ],
      },
      {
        heading: "Specialist trades",
        body: [
          "Beyond electronics, iRepairly supports specialist trades including jewellery and watch repair, instrument restoration, sporting goods servicing, and clothing alterations — each with fields and workflows tuned to the trade.",
        ],
      },
    ],
    faqs: [
      { question: "What size of business is iRepairly built for?", answer: "iRepairly scales from a single independent counter to multi-branch groups with dozens of staff." },
      { question: "Are there case studies available?", answer: "Yes, see our Case Studies page for detailed examples of shops using the platform." },
    ],
    related: [
      { label: "Case Studies", href: "/resources/case-studies" },
      { label: "About", href: "/company/about" },
      { label: "All Industries", href: "/industries" },
    ],
  },
  {
    slug: "careers",
    name: "Careers",
    icon: Briefcase,
    kicker: "Join Us",
    tagline: "Help us build the tools repair businesses actually want.",
    description:
      "We're a small, product-focused team building software for an industry that's often overlooked by tech. If you care about craft, reliability, and shipping things that genuinely help small businesses, we'd like to hear from you.",
    metaDescription:
      "Explore careers at iRepairly and help build the operating system for modern repair businesses.",
    keywords: ["iRepairly careers", "repair software jobs", "join our team"],
    sections: [
      {
        heading: "How we work",
        body: [
          "We work in small, focused teams close to our customers. Most of what we build starts as a conversation with a repair shop owner or technician, not a roadmap drafted in isolation.",
          "We value directness, fast iteration, and a bias toward shipping — balanced with genuine care for the reliability of software that repair businesses depend on every day.",
        ],
      },
      {
        heading: "Open roles",
        body: [
          "This is placeholder content — no live vacancies are listed here yet. When roles are open, they'll be listed on this page along with details on our hiring process and what it's like to work with us.",
        ],
      },
    ],
    faqs: [
      { question: "Are you hiring right now?", answer: "This page is a placeholder — check back for current openings, or reach out via Contact Us." },
      { question: "Do you support remote work?", answer: "This will be confirmed alongside published role details once vacancies are live." },
    ],
    related: [
      { label: "About", href: "/company/about" },
      { label: "Contact Us", href: "/company/contact-us" },
      { label: "Press", href: "/company/press" },
    ],
  },
  {
    slug: "press",
    name: "Press",
    icon: Newspaper,
    kicker: "Media & News",
    tagline: "Company news, announcements, and media resources.",
    description:
      "Find company announcements, brand assets, and media contact details for journalists and partners covering iRepairly.",
    metaDescription:
      "Press resources, brand assets, and media contact information for iRepairly.",
    keywords: ["iRepairly press", "media kit", "company announcements"],
    sections: [
      {
        heading: "Latest news",
        body: [
          "This is placeholder content. Company announcements, product launches, and milestones will be published here as they happen.",
        ],
      },
      {
        heading: "Media enquiries",
        body: [
          "For interview requests, brand assets, or media enquiries, please reach out via the Contact Us page and a member of our team will respond.",
        ],
      },
    ],
    related: [
      { label: "About", href: "/company/about" },
      { label: "Contact Us", href: "/company/contact-us" },
      { label: "Blog", href: "/resources/blog" },
    ],
  },
  {
    slug: "contact-us",
    name: "Contact Us",
    icon: Mail,
    kicker: "Get In Touch",
    tagline: "We're happy to answer questions, big or small.",
    description:
      "Whether you're evaluating iRepairly for your shop, need help with an existing account, or want to talk press or partnerships, here's how to reach us.",
    metaDescription:
      "Contact the iRepairly team for sales, support, press, or partnership enquiries.",
    keywords: ["contact iRepairly", "repair software support", "sales enquiries"],
    sections: [
      {
        heading: "Sales enquiries",
        body: [
          "Interested in iRepairly for your shop? Start a free trial from the homepage, or book a 20-minute demo and a member of our team will walk you through the platform.",
        ],
      },
      {
        heading: "Existing customers",
        body: [
          "Already using iRepairly? Visit our Help Centre or Support pages for the fastest way to get an answer, or reach your account contact directly.",
        ],
      },
      {
        heading: "Press & partnerships",
        body: [
          "For press enquiries or partnership discussions, please get in touch and our team will route your message appropriately.",
        ],
      },
    ],
    related: [
      { label: "Support", href: "/resources/support" },
      { label: "Help Centre", href: "/resources/help-centre" },
      { label: "About", href: "/company/about" },
    ],
  },
];
