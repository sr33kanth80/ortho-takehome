import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// The design system's pplxSans is proprietary; the spec names Inter as its
// substitute. Weights capped at 400/500 per the "no bold" rule.
const inter = Inter({
  variable: "--font-pplxsans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Meridian — live-data research assistant",
  description:
    "AI chat assistant grounded in real-world data via Orthogonal's API catalog: companies, contacts, web results, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
