import {
  Lock,
  Cookie,
  ScrollText,
  FileCheck,
  ShieldAlert,
  FileText,
} from "lucide-react";
import type { LegalPage } from "./types";

const DISCLAIMER =
  "This page contains sample placeholder content for demonstration purposes only. It does not constitute legal advice and must be reviewed and adapted by a qualified legal professional before being used in production.";

export const legalPages: LegalPage[] = [
  {
    slug: "privacy-policy",
    name: "Privacy Policy",
    icon: Lock,
    lastUpdated: "1 June 2026",
    summary: "How iRepairly collects, uses, and protects your personal data.",
    metaDescription:
      "iRepairly's Privacy Policy explains what data we collect, how it's used, and the rights you have over your information.",
    sections: [
      { heading: "Legal disclaimer", body: [DISCLAIMER] },
      {
        heading: "1. Information we collect",
        body: [
          "We may collect information you provide directly, such as your name, email address, phone number, and business details when you create an account, along with usage data collected automatically as you use the platform.",
        ],
      },
      {
        heading: "2. How we use information",
        body: [
          "Information is used to provide and improve the service, communicate with you about your account, process payments, and comply with legal obligations. We do not sell personal data to third parties.",
        ],
      },
      {
        heading: "3. Data sharing",
        body: [
          "We may share data with service providers who help us operate the platform, such as payment processors and hosting providers, under appropriate confidentiality and data protection agreements.",
        ],
      },
      {
        heading: "4. Data retention",
        body: [
          "We retain personal data for as long as necessary to provide the service and meet legal, accounting, or reporting requirements, after which it is securely deleted or anonymised.",
        ],
      },
      {
        heading: "5. Your rights",
        body: [
          "Depending on your jurisdiction, you may have rights to access, correct, delete, or export your personal data. Requests can be made through your account settings or by contacting our team.",
        ],
      },
    ],
    related: [
      { label: "Cookie Policy", href: "/company/cookie-policy" },
      { label: "Data Processing Agreement", href: "/company/data-processing-agreement" },
      { label: "Contact Us", href: "/company/contact-us" },
    ],
  },
  {
    slug: "cookie-policy",
    name: "Cookie Policy",
    icon: Cookie,
    lastUpdated: "1 June 2026",
    summary: "How iRepairly uses cookies and similar technologies.",
    metaDescription:
      "iRepairly's Cookie Policy explains what cookies we use, why, and how to manage your preferences.",
    sections: [
      { heading: "Legal disclaimer", body: [DISCLAIMER] },
      {
        heading: "1. What are cookies",
        body: [
          "Cookies are small text files placed on your device that help us recognise your browser, remember preferences, and understand how our website and platform are used.",
        ],
      },
      {
        heading: "2. Types of cookies we use",
        body: [
          "We use essential cookies required for the platform to function, analytics cookies to understand usage patterns, and preference cookies that remember your settings between visits.",
        ],
      },
      {
        heading: "3. Managing cookies",
        body: [
          "You can manage or disable cookies through your browser settings at any time. Disabling essential cookies may affect the functionality of the platform.",
        ],
      },
      {
        heading: "4. Third-party cookies",
        body: [
          "Some cookies may be set by third-party services we use for analytics or payment processing, governed by those providers' own privacy and cookie policies.",
        ],
      },
    ],
    related: [
      { label: "Privacy Policy", href: "/company/privacy-policy" },
      { label: "Website T&C's", href: "/company/website-terms-and-conditions" },
      { label: "Contact Us", href: "/company/contact-us" },
    ],
  },
  {
    slug: "website-terms-and-conditions",
    name: "Website T&C's",
    icon: ScrollText,
    lastUpdated: "1 June 2026",
    summary: "The terms that govern your use of the iRepairly website.",
    metaDescription:
      "Read the terms and conditions governing use of the iRepairly website and marketing content.",
    sections: [
      { heading: "Legal disclaimer", body: [DISCLAIMER] },
      {
        heading: "1. Acceptance of terms",
        body: [
          "By accessing or using the iRepairly website, you agree to be bound by these terms and conditions. If you do not agree, please do not use the website.",
        ],
      },
      {
        heading: "2. Use of content",
        body: [
          "Content on this website, including text, graphics, and branding, is owned by or licensed to iRepairly and may not be reproduced without permission.",
        ],
      },
      {
        heading: "3. Availability",
        body: [
          "We aim to keep the website available at all times but do not guarantee uninterrupted access and may suspend or restrict access for maintenance or other operational reasons.",
        ],
      },
      {
        heading: "4. Limitation of liability",
        body: [
          "The website and its content are provided 'as is' without warranties of any kind. iRepairly is not liable for any losses arising from use of the website to the extent permitted by law.",
        ],
      },
    ],
    related: [
      { label: "User Agreement", href: "/company/user-agreement" },
      { label: "Privacy Policy", href: "/company/privacy-policy" },
      { label: "Acceptable Use Policy", href: "/company/acceptable-use-policy" },
    ],
  },
  {
    slug: "user-agreement",
    name: "User Agreement",
    icon: FileText,
    lastUpdated: "1 June 2026",
    summary: "The agreement between iRepairly and businesses using the platform.",
    metaDescription:
      "iRepairly's User Agreement outlines the terms of service for businesses using the platform.",
    sections: [
      { heading: "Legal disclaimer", body: [DISCLAIMER] },
      {
        heading: "1. Account responsibilities",
        body: [
          "You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.",
        ],
      },
      {
        heading: "2. Subscription and billing",
        body: [
          "Access to paid features is subject to an active subscription. Billing terms, trial periods, and cancellation policies are described at checkout and within your account settings.",
        ],
      },
      {
        heading: "3. Your data",
        body: [
          "You retain ownership of the business and customer data you input into the platform. You may export your data at any time, including if you choose to leave the service.",
        ],
      },
      {
        heading: "4. Termination",
        body: [
          "Either party may terminate this agreement in accordance with the notice periods described in your subscription terms. We reserve the right to suspend accounts that violate our Acceptable Use Policy.",
        ],
      },
    ],
    related: [
      { label: "Website T&C's", href: "/company/website-terms-and-conditions" },
      { label: "Data Processing Agreement", href: "/company/data-processing-agreement" },
      { label: "Acceptable Use Policy", href: "/company/acceptable-use-policy" },
    ],
  },
  {
    slug: "data-processing-agreement",
    name: "Data Processing Agreement",
    icon: FileCheck,
    lastUpdated: "1 June 2026",
    summary: "Terms governing how iRepairly processes personal data on your behalf.",
    metaDescription:
      "iRepairly's Data Processing Agreement outlines how we process personal data as a data processor on behalf of your business.",
    sections: [
      { heading: "Legal disclaimer", body: [DISCLAIMER] },
      {
        heading: "1. Roles of the parties",
        body: [
          "For personal data belonging to your customers processed within the platform, your business acts as the data controller and iRepairly acts as the data processor.",
        ],
      },
      {
        heading: "2. Processing instructions",
        body: [
          "iRepairly will process personal data only in accordance with your documented instructions and the purposes of providing the service, unless required otherwise by law.",
        ],
      },
      {
        heading: "3. Security measures",
        body: [
          "We maintain technical and organisational measures designed to protect personal data against unauthorised access, loss, or disclosure, appropriate to the risk involved.",
        ],
      },
      {
        heading: "4. Sub-processors",
        body: [
          "We may engage sub-processors to support the service, such as hosting or payment providers, and will ensure they are bound by data protection obligations consistent with this agreement.",
        ],
      },
    ],
    related: [
      { label: "Privacy Policy", href: "/company/privacy-policy" },
      { label: "User Agreement", href: "/company/user-agreement" },
      { label: "Security", href: "/resources/security" },
    ],
  },
  {
    slug: "acceptable-use-policy",
    name: "Acceptable Use Policy",
    icon: ShieldAlert,
    lastUpdated: "1 June 2026",
    summary: "Rules governing acceptable use of the iRepairly platform.",
    metaDescription:
      "iRepairly's Acceptable Use Policy outlines prohibited activities and expectations for platform users.",
    sections: [
      { heading: "Legal disclaimer", body: [DISCLAIMER] },
      {
        heading: "1. Prohibited activities",
        body: [
          "You may not use the platform to store or transmit unlawful content, attempt to gain unauthorised access to other accounts or systems, or interfere with the platform's normal operation.",
        ],
      },
      {
        heading: "2. Customer data handling",
        body: [
          "You must have a lawful basis for any personal data you input into the platform about your customers and must handle that data in compliance with applicable law.",
        ],
      },
      {
        heading: "3. Fair use",
        body: [
          "Automated or excessive use of the platform that degrades service performance for other users, including abuse of the API, is not permitted.",
        ],
      },
      {
        heading: "4. Enforcement",
        body: [
          "Violations of this policy may result in suspension or termination of your account, in accordance with the terms of your User Agreement.",
        ],
      },
    ],
    related: [
      { label: "User Agreement", href: "/company/user-agreement" },
      { label: "Website T&C's", href: "/company/website-terms-and-conditions" },
      { label: "Security", href: "/resources/security" },
    ],
  },
];
