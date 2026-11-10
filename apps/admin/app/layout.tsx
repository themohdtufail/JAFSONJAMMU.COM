import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@jafson/design-tokens/tokens.css";
import "./globals.css";
import { Shell } from "@/components/Shell";
export const metadata: Metadata = { title: { default: "Jafson Back-office", template: "%s | Jafson Back-office" }, robots: { index: false, follow: false }, icons: { icon: "/brand/favicon-32.png", apple: "/brand/apple-touch-icon.png" } };
export default function Root({ children }: { children: ReactNode }) {
  return (<html lang="en-IN"><body><Shell>{children}</Shell></body></html>);
}
