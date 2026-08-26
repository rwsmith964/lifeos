import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/constants";

// Next.js App Router serves this at /manifest.webmanifest automatically
// (correct content-type, no public/ file needed) and links it from
// <head> via the root layout's metadata.manifest. Icons below live in
// public/ rather than app/icon.png because the manifest needs a stable
// content-hashed-free path at multiple explicit sizes — app/icon.png is
// still kept separately for the favicon/App Router icon convention.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Never miss a gift. Never lose touch. One spine for the people in your life.",
    start_url: "/calendar",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
