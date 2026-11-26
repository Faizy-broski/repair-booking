import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Tenant app font (Figma design) — applied via body:has(.app-shell) in globals.css
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "repairbooking.co.uk";

export const metadata: Metadata = {
  // Makes every relative canonical / OG URL resolve to an absolute URL.
  metadataBase: new URL(`https://${ROOT_DOMAIN}`),
  title: {
    default: "RepairBooking POS & Repair Management for Modern Shops",
    template: "%s | RepairBooking",
  },
  description:
    "Cloud POS and repair booking platform for repair shops, electronics stores and multi-branch retail. Manage repairs, inventory, staff and invoices.",
  keywords: "repair shop software, POS system, repair booking, inventory management, multi-branch POS",
  openGraph: {
    title: "RepairBooking POS & Repair Management",
    description: "All-in-one cloud POS and repair booking platform for modern repair shops.",
    type: "website",
  },
  verification: {
    google: [
      "cMJOrBZBBwCbdkH_9cOmGnPZJEirWt8SeX7eM2yH05A",
      "bB-Gt4W1L8a3lvBrT8Nt-2t9YmP0MTxZUvQoUFaf7YE",
      "ThOPFXow67jBNTgAYiHu1cT4-jfx30cVFUABV4iUbfs",
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-18250909348"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-18250909348');
            gtag('config', 'G-MHPSXRVKT2');
          `}
        </Script>
      </head>
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
