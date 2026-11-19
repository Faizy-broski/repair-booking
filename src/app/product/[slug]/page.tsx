import type { Metadata } from "next";
import { buildTitle, fullTitle } from "@/lib/seo";
import { notFound } from "next/navigation";
import ProductPageTemplate from "@/components/pages/ProductPageTemplate";
import { productPages, getProductPage } from "@/lib/footer-pages";

export function generateStaticParams() {
  return productPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getProductPage(slug);
  if (!page) return {};

  const title = buildTitle(page.name, [" – Repair Shop Software", " for Repair Shop Software"]);

  return {
    title,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: `/product/${page.slug}` },
    openGraph: {
      title: fullTitle(title),
      description: page.metaDescription,
      type: "website",
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getProductPage(slug);
  if (!page) notFound();

  return <ProductPageTemplate page={page} />;
}
