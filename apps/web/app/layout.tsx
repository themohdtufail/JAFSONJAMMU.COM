import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BagDrawer, SearchOverlay, Toasts } from "@/components/Drawers";

export const metadata: Metadata = {
  title: { default: "JAFSON JAMMU — Men's & Kids' Fashion", template: "%s | JAFSON JAMMU" },
  description: "Considered men's and kids' clothing from Jammu. Complimentary shipping above ₹1,999, cash on delivery and showroom pickup.",
};
export const viewport: Viewport = { themeColor: "#f5f0e6", width: "device-width", initialScale: 1 };

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <Providers>
          <Header /><main id="main">{children}</main><Footer /><BagDrawer /><SearchOverlay /><Toasts />
        </Providers>
      </body>
    </html>
  );
}
