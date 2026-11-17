import type { Metadata } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bengali",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://onno-convert.vercel.app"),
  title: {
    default: "Onno Convert — Convert anything. Privately.",
    template: "%s · Onno Convert",
  },
  description:
    "Browser-only file converter for PDF, images, data, audio, video and ebooks. Your files never leave your device. By OnnoPoth.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Onno Convert",
    title: "Onno Convert — Convert anything. Privately.",
    description: "Private, browser-only file conversion. Your files never leave your device.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Onno Convert by OnnoPoth",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Onno Convert — Convert anything. Privately.",
    description: "Private, browser-only file conversion. Your files never leave your device.",
    images: ["/opengraph-image.png"],
  },
};

// Applies the saved theme before paint; no library, no flash.
const themeScript = `try{const t=localStorage.getItem("onno-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bengali.variable}`} suppressHydrationWarning>
      {/* Raw HTML keeps the pre-paint script out of React's component tree. */}
      <head suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `<script>${themeScript}</script>` }} />
      <body className="min-h-dvh antialiased">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
