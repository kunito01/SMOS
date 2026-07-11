import type { Metadata } from "next";
import { Notable } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const notable = Notable({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-notable",
  weight: "400"
});

export const metadata: Metadata = {
  title: "Studio Map OS",
  description: "A visual project operating system for creative studios."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={notable.variable}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
