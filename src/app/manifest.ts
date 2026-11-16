import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Onno Convert",
    short_name: "Onno Convert",
    description: "Convert anything. Privately. By OnnoPoth.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#f6f5f2",
    icons: [
      { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
