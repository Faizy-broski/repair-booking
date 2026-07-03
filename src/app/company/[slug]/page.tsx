import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CompanyPageTemplate from "@/components/pages/CompanyPageTemplate";
import LegalPageTemplate from "@/components/pages/LegalPageTemplate";
import { companyPages, legalPages, getCompanyPage, getLegalPage } from "@/lib/footer-pages";

export function generateStaticParams() {
  return [...companyPages, ...legalPages].map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = getCompanyPage(slug);
  if (company) {
    return {
      title: `${company.name} | iRepairly`,
      description: company.metaDescription,
      keywords: company.keywords,
      alternates: { canonical: `/company/${company.slug}` },
      openGraph: {
        title: `${company.name} | iRepairly`,
        description: company.metaDescription,
        type: "website",
      },
    };
  }

  const legal = getLegalPage(slug);
  if (legal) {
    return {
      title: `${legal.name} | iRepairly`,
      description: legal.metaDescription,
      alternates: { canonical: `/company/${legal.slug}` },
      openGraph: {
        title: `${legal.name} | iRepairly`,
        description: legal.metaDescription,
        type: "website",
      },
    };
  }

  return {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const company = getCompanyPage(slug);
  if (company) return <CompanyPageTemplate page={company} />;

  const legal = getLegalPage(slug);
  if (legal) return <LegalPageTemplate page={legal} />;

  notFound();
}
