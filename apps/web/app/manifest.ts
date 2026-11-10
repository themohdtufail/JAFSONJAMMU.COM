import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Jafson Jammu", short_name: "Jafson", start_url: "/", display: "standalone", background_color: "#ffffff", theme_color: "#f1521d",
    icons: [{ src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" }] };
}
