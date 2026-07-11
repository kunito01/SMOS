import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const scope = `${basePath}/`;

  return {
    id: scope,
    name: "Studio Map OS",
    short_name: "Studio Map OS",
    description: "A private, local-first project operating system for creative studios.",
    start_url: `${basePath}/login${basePath ? "/" : ""}`,
    scope,
    display: "standalone",
    background_color: "#eef6f6",
    theme_color: "#1c2328",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: `${basePath}/icons/pwa-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: `${basePath}/icons/pwa-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: `${basePath}/icons/pwa-maskable-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: `${basePath}/icons/pwa-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
