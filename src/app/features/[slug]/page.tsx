import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FeaturePageTemplate from "@/components/pages/FeaturePageTemplate";
import { featurePages, getFeaturePage } from "@/lib/footer-pages";

export function generateStaticParams() {
  return featurePages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getFeaturePage(slug);
  if (!page) return {};

  return {
    title: `${page.name} | iRepairly Features`,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: `/features/${page.slug}` },
    openGraph: {
      title: `${page.name} | iRepairly Features`,
      description: page.metaDescription,
      type: "website",
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getFeaturePage(slug);
  if (!page) notFound();

  return <FeaturePageTemplate page={page} />;
}
