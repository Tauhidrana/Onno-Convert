import type { MetadataRoute } from "next";
import { availableTools } from "@/convert/registry";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://onno-convert.vercel.app";
  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    ...availableTools.map((tool) => ({
      url: `${base}/convert/${tool.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
