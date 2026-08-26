import { productPages } from "./footer-pages/product";
import { featurePages } from "./footer-pages/features";
import { industryPages } from "./footer-pages/industries";
import { servicePages } from "./services-pages/services";
import { serviceArticlePages } from "./services-pages/service-articles";
import { companyPages } from "./footer-pages/company";
import { legalPages } from "./footer-pages/legal";
import { resourcePages } from "./footer-pages/resources";

export * from "./footer-pages/types";
export {
  productPages,
  featurePages,
  industryPages,
  servicePages,
  serviceArticlePages,
  companyPages,
  legalPages,
  resourcePages,
};

export function getProductPage(slug: string) {
  return productPages.find((p) => p.slug === slug);
}
export function getFeaturePage(slug: string) {
  return featurePages.find((p) => p.slug === slug);
}
export function getIndustryPage(slug: string) {
  return industryPages.find((p) => p.slug === slug);
}
export function getServicePage(slug: string) {
  return servicePages.find((p) => p.slug === slug);
}
export function getServiceArticlePage(slug: string) {
  return serviceArticlePages.find((p) => p.slug === slug);
}
export function getCompanyPage(slug: string) {
  return companyPages.find((p) => p.slug === slug);
}
export function getLegalPage(slug: string) {
  return legalPages.find((p) => p.slug === slug);
}
export function getResourcePage(slug: string) {
  const direct = resourcePages.find((p) => p.slug === slug);
  if (direct) return direct;
  // Fall back to alias lookup (e.g. "platform-status" style stragglers).
  return resourcePages.find((p) => p.aliases?.some((a) => a.toLowerCase() === slug.toLowerCase()));
}

/**
 * Mirrors the original footer link groups exactly (label + order), but each
 * link now carries a real href resolved against the content data above.
 * Duplicate labels (Changelog/Change log, Status/Platform Status) resolve to
 * the same canonical page.
 */
export interface FooterLink {
  label: string;
  href: string;
}
export interface FooterLinkGroup {
  title: string;
  links: FooterLink[];
}

export const footerLinkGroups: FooterLinkGroup[] = [
  {
    title: "Product",
    links: [
      { label: "Tickets", href: "/product/tickets" },
      { label: "POS", href: "/product/pos" },
      { label: "Inventory", href: "/product/inventory" },
      { label: "Analytics", href: "/product/analytics" },
      { label: "AI co-pilot", href: "/product/ai-co-pilot" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/company/about" },
      { label: "Customers", href: "/company/customers" },
      { label: "Careers", href: "/company/careers" },
      { label: "Press", href: "/company/press" },
      { label: "Contact Us", href: "/company/contact-us" },
      { label: "Privacy Policy", href: "/company/privacy-policy" },
      { label: "Cookie Policy", href: "/company/cookie-policy" },
      { label: "Website T&C's", href: "/company/website-terms-and-conditions" },
      { label: "User Agreement", href: "/company/user-agreement" },
      { label: "Data Processing Agreement", href: "/company/data-processing-agreement" },
      { label: "Acceptable Use Policy", href: "/company/acceptable-use-policy" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/resources/docs" },
      { label: "API", href: "/resources/api" },
      { label: "Changelog", href: "/resources/changelog" },
      { label: "Status", href: "/resources/status" },
      { label: "Security", href: "/resources/security" },
      { label: "Platform Status", href: "/resources/status" },
      { label: "Support", href: "/resources/support" },
      { label: "Help Centre", href: "/resources/help-centre" },
      { label: "Blog", href: "/resources/blog" },
      { label: "Migrations", href: "/resources/migrations" },
      { label: "Case Studies", href: "/resources/case-studies" },
      { label: "FAQ", href: "/resources/faq" },
      { label: "Development Roadmap", href: "/resources/development-roadmap" },
      { label: "Change log", href: "/resources/changelog" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Why iRepairly?", href: "/features/why-irepairly" },
      { label: "Business Types", href: "/features/business-types" },
      { label: "All Features", href: "/features" },
      { label: "Job Management", href: "/features/job-management" },
      { label: "Customer CRM", href: "/features/customer-crm" },
      { label: "Leads", href: "/features/leads" },
      { label: "Invoicing & Payments", href: "/features/invoicing-and-payments" },
      { label: "Worksheets", href: "/features/worksheets" },
      { label: "Automation", href: "/features/automation" },
      { label: "Stock Management", href: "/features/stock-management" },
      { label: "Trade/Buy In Items", href: "/features/trade-buy-in-items" },
      { label: "Customer Portal", href: "/features/customer-portal" },
      { label: "Multiple Stores/Locations", href: "/features/multiple-stores-locations" },
      { label: "Reporting", href: "/features/reporting" },
      { label: "Customization", href: "/features/customization" },
      { label: "Integrations", href: "/features/integrations" },
    ],
  },
  {
    title: "Industries",
    links: [
      { label: "All Industries", href: "/industries" },
      { label: "Mobile Phone Repair", href: "/industries/mobile-phone-repair" },
      { label: "Computer Repair", href: "/industries/computer-repair" },
      { label: "Bicycle Repair", href: "/industries/bicycle-repair" },
      { label: "Car Repair", href: "/industries/car-repair" },
      { label: "Racket Restringing", href: "/industries/racket-restringing" },
      { label: "Bat Preparation", href: "/industries/bat-preparation" },
      { label: "Jewellery Repair", href: "/industries/jewellery-repair" },
      { label: "Tablet Repair", href: "/industries/tablet-repair" },
      { label: "Shoe Repair", href: "/industries/shoe-repair" },
      { label: "Motorcycle Repair", href: "/industries/motorcycle-repair" },
      { label: "Clothing Alterations", href: "/industries/clothing-alterations" },
      { label: "Guitar Repair", href: "/industries/guitar-repair" },
      { label: "Game Console Repair", href: "/industries/game-console-repair" },
      { label: "Appliance Repair", href: "/industries/appliance-repair" },
      { label: "Watch Repair", href: "/industries/watch-repair" },
      { label: "Electronics Repair", href: "/industries/electronics-repair" },
    ],
  },
];
