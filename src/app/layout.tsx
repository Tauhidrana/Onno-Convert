import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: {
    default: "Onno Convert — Convert anything. Privately.",
    template: "%s · Onno Convert",
  },
  description:
    "Browser-only file converter for PDF, images, data, audio, video and ebooks. Your files never leave your device. By OnnoPoth.",
};

// Applies the saved theme before paint; no library, no flash.
const themeScript = `try{const t=localStorage.getItem("onno-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
