import type { Metadata } from "next";

import { PRODUCT } from "@/config/product";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bulletinbrief.in"),
  title: {
    default: PRODUCT.name,
    template: `%s · ${PRODUCT.name}`,
  },
  description: PRODUCT.description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: PRODUCT.name,
    title: `${PRODUCT.name} — ${PRODUCT.landing.title}`,
    description: PRODUCT.landing.description,
    images: [
      {
        url: "/bulletin-social-preview.png",
        width: 1200,
        height: 630,
        alt: `${PRODUCT.name} — ${PRODUCT.landing.title}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT.name} — ${PRODUCT.landing.title}`,
    description: PRODUCT.landing.description,
    images: ["/bulletin-social-preview.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
