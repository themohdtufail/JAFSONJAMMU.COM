import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Shell } from "@/components/Shell";
export const metadata: Metadata = { title: { default: "JAFSON Back-office", template: "%s | JAFSON Back-office" }, robots: { index: false, follow: false } };
export default function Root({ children }: { children: ReactNode }) {
  return (<html lang="en-IN"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  </head><body><Shell>{children}</Shell></body></html>);
}
