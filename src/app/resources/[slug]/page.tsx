import type { Metadata } from "next";
import { buildTitle, fullTitle } from "@/lib/seo";
import { notFound } from "next/navigation";
import ResourcePageTemplate from "@/components/pages/ResourcePageTemplate";
import { resourcePages, getResourcePage } from "@/lib/footer-pages";

export function generateStaticParams() {
  return resourcePages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getResourcePage(slug);
  if (!page) return {};

  const title = buildTitle(page.name, [" – RepairBooking Resources", " – Repair Shop Software Resources", " – Resources"]);

  return {
    title,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: `/resources/${page.slug}` },
    ...(page.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: fullTitle(title),
      description: page.metaDescription,
      type: "website",
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getResourcePage(slug);
  if (!page) notFound();

  return <ResourcePageTemplate page={page} />;
}
