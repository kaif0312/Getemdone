import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import RegisterServiceWorker from "./register-sw";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "Nudge",
  description: "Stay on track, together. Gentle accountability with friends.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nudge",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "hsl(220, 85%, 50%)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-background transition-[background-color,color] duration-200 ease-out`}
        suppressHydrationWarning
      >
        <RegisterServiceWorker />
        <Providers>
        {children}
        </Providers>
      </body>
    </html>
  );
}
