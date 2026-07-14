import type { Metadata } from "next";
import { Inter, DM_Serif_Display } from "next/font/google";
import { ReadmeButton } from "@/components/readme-button";
import "./globals.css";

// Getclockwise design system. Body/UI text is Inter with tight editorial
// tracking; the -0.03em tracking is applied in globals.css.
const inter = Inter({
  variable: "--font-pplxsans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// The system's display face is PP Mori (proprietary); the spec names
// DM Serif Display as its substitute for all headings/display text.
const dmSerif = DM_Serif_Display({
  variable: "--font-dmserif",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Meridian: live data research assistant",
  description:
    "AI chat assistant grounded in real world data via Orthogonal's API catalog: companies, contacts, web results, and more.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSerif.variable} h-full`}>
      <body className="h-full overflow-hidden">
        <ReadmeButton />
        {children}
      </body>
    </html>
  );
}
