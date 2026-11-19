import type { Metadata } from "next";
import { buildTitle, fullTitle } from "@/lib/seo";
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

  const title = buildTitle(page.name, [" for Repair Shops", " Software for Repair Shops", " Feature for Repair Shop Software"]);

  return {
    title,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: `/features/${page.slug}` },
    openGraph: {
      title: fullTitle(title),
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
