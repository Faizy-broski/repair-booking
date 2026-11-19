import type { Metadata } from "next";
import { buildTitle, fullTitle } from "@/lib/seo";
import { notFound } from "next/navigation";
import IndustryPageTemplate from "@/components/pages/IndustryPageTemplate";
import { industryPages, getIndustryPage } from "@/lib/footer-pages";

export function generateStaticParams() {
  return industryPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getIndustryPage(slug);
  if (!page) return {};

  const title = buildTitle(`${page.name} Software`, [" – POS & Repair Management", " – Repair Management"]);

  return {
    title,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: `/industries/${page.slug}` },
    openGraph: {
      title: fullTitle(title),
      description: page.metaDescription,
      type: "website",
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getIndustryPage(slug);
  if (!page) notFound();

  return <IndustryPageTemplate page={page} />;
}
