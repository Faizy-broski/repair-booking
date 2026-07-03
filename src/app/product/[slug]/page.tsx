import type { Metadata } from "next";
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

  return {
    title: `${page.name} | iRepairly`,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: `/product/${page.slug}` },
    openGraph: {
      title: `${page.name} | iRepairly`,
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
