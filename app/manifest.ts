import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fourth Up",
    short_name: "Fourth Up",
    description: "Find pickleball players near you.",
    start_url: "/play",
    display: "standalone",
    background_color: "#edf1ec",
    theme_color: "#2459a6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
