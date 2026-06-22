import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RepairBooking POS & Repair Management for Modern Shops",
  description:
    "All-in-one cloud POS and repair booking platform for repair shops, electronics stores, and multi-branch retail. Manage repairs, inventory, staff, invoices and more.",
  keywords: "repair shop software, POS system, repair booking, inventory management, multi-branch POS",
  openGraph: {
    title: "RepairBooking POS & Repair Management",
    description: "All-in-one cloud POS and repair booking platform for modern repair shops.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
          `}
        </Script>
      </head>
      <body
        className={`${poppins.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
