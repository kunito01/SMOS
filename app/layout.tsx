import type { Metadata, Viewport } from "next";
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
  applicationName: "Studio Map OS",
  title: {
    default: "Studio Map OS",
    template: "%s · Studio Map OS"
  },
  description: "A private, local-first project operating system for creative studios.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Studio Map OS"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c2328",
  colorScheme: "light"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={notable.variable}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
