import type { Metadata } from "next";
import { buildTitle, fullTitle } from "@/lib/seo";
import { notFound, redirect } from "next/navigation";
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
    const title = buildTitle(company.name, [" – About RepairBooking", " – Repair Shop Software"]);
    return {
      title,
      description: company.metaDescription,
      keywords: company.keywords,
      alternates: { canonical: `/company/${company.slug}` },
      ...(company.noindex ? { robots: { index: false, follow: true } } : {}),
      openGraph: {
        title: fullTitle(title),
        description: company.metaDescription,
        type: "website",
      },
    };
  }

  const legal = getLegalPage(slug);
  if (legal) {
    const title = buildTitle(legal.name, [" – RepairBooking Legal", " – RepairBooking Legal Policies"]);
    return {
      title,
      description: legal.metaDescription,
      alternates: { canonical: `/company/${legal.slug}` },
      openGraph: {
        title: fullTitle(title),
        description: legal.metaDescription,
        type: "website",
      },
    };
  }

  return {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === "contact-us") {
    redirect("/contact");
  }

  const company = getCompanyPage(slug);
  if (company) return <CompanyPageTemplate page={company} />;

  const legal = getLegalPage(slug);
  if (legal) return <LegalPageTemplate page={legal} />;

  notFound();
}
