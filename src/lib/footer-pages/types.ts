import type { LucideIcon } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
}

export interface BenefitItem {
  icon: LucideIcon;
  title: string;
  desc: string;
}

export interface UseCaseItem {
  title: string;
  desc: string;
}

export interface RelatedLink {
  label: string;
  href: string;
}

/** Product / Feature pages share the same content shape. */
export interface CapabilityPage {
  slug: string;
  name: string;
  icon: LucideIcon;
  kicker: string;
  tagline: string;
  description: string;
  metaDescription: string;
  keywords: string[];
  benefits: BenefitItem[];
  useCases: UseCaseItem[];
  faqs: FaqItem[];
  related: RelatedLink[];
}

export interface IndustryPage {
  slug: string;
  name: string;
  icon: LucideIcon;
  kicker: string;
  tagline: string;
  description: string;
  metaDescription: string;
  keywords: string[];
  painPoints: { title: string; desc: string }[];
  howWeHelp: BenefitItem[];
  workflow: { title: string; desc: string }[];
  faqs: FaqItem[];
  related: RelatedLink[];
}

export interface ContentSection {
  heading: string;
  body: string[];
}

export interface CompanyPage {
  slug: string;
  name: string;
  icon: LucideIcon;
  kicker: string;
  tagline: string;
  description: string;
  metaDescription: string;
  keywords: string[];
  sections: ContentSection[];
  faqs?: FaqItem[];
  related: RelatedLink[];
}

export interface LegalPage {
  slug: string;
  name: string;
  icon: LucideIcon;
  lastUpdated: string;
  summary: string;
  metaDescription: string;
  sections: ContentSection[];
  related: RelatedLink[];
}

export interface ResourcePage {
  slug: string;
  name: string;
  icon: LucideIcon;
  kicker: string;
  tagline: string;
  description: string;
  metaDescription: string;
  keywords: string[];
  sections: ContentSection[];
  faqs?: FaqItem[];
  related: RelatedLink[];
  aliases?: string[];
}
