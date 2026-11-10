import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@jafson/design-tokens/tokens.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BagDrawer, SearchOverlay, Toasts } from "@/components/Drawers";

export const metadata: Metadata = {
  title: { default: "Jafson Jammu | Menswear and kidswear", template: "%s | Jafson Jammu" },
  description: "Jafson Jammu is a multi-brand menswear and kidswear store, online and in seven stores across Kashmir and Jammu.",
  icons: { icon: [{ url: "/brand/favicon-32.png", sizes: "32x32" }], apple: "/brand/apple-touch-icon.png" },
  openGraph: { title: "Jafson Jammu", description: "Menswear and kidswear, online and in stores across Kashmir and Jammu.", images: [{ url: "/brand/share.png", width: 1200, height: 630 }] },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#f1521d", width: "device-width", initialScale: 1 };

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <Providers>
          <Header /><main id="main">{children}</main><Footer /><BagDrawer /><SearchOverlay /><Toasts />
        </Providers>
      </body>
    </html>
  );
}
