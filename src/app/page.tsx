import type { Metadata } from "next";
import HomePage from "@/components/landing/home-page";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Page() {
  return <HomePage />;
}
