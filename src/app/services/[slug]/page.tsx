import type { Metadata } from "next";
import { buildTitle, fullTitle } from "@/lib/seo";
import { notFound } from "next/navigation";
import ServicePageTemplate from "@/components/pages/ServicePageTemplate";
import ArticlePageTemplate from "@/components/pages/ArticlePageTemplate";
import {
  servicePages,
  serviceArticlePages,
  getServicePage,
  getServiceArticlePage,
} from "@/lib/footer-pages";

export function generateStaticParams() {
  return [...servicePages, ...serviceArticlePages].map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const page = getServicePage(slug);
  if (page) {
    const title = buildTitle(page.name, [" – Repair Management", " – POS & Repair Management"]);
    return {
      title,
      description: page.metaDescription,
      keywords: page.keywords,
      alternates: { canonical: `/services/${page.slug}` },
      openGraph: {
        title: fullTitle(title),
        description: page.metaDescription,
        type: "website",
      },
    };
  }

  const article = getServiceArticlePage(slug);
  if (article) {
    return {
      title: { absolute: article.seoTitle },
      description: article.metaDescription,
      keywords: article.keywords,
      alternates: { canonical: `/services/${article.slug}` },
      openGraph: {
        title: article.seoTitle,
        description: article.metaDescription,
        type: "article",
      },
    };
  }

  return {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const page = getServicePage(slug);
  if (page) return <ServicePageTemplate page={page} />;

  const article = getServiceArticlePage(slug);
  if (article) return <ArticlePageTemplate page={article} />;

  notFound();
}
