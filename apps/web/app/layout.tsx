import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BagDrawer, SearchOverlay } from "@/components/Drawers";

export const metadata: Metadata = {
  title: "JAFSON JAMMU — Men's & Kids' Fashion",
  description: "Premium men's and kids' clothing from Jammu. Free shipping above ₹1,999, COD and showroom pickup.",
};
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <Header /><main>{children}</main><Footer /><BagDrawer /><SearchOverlay />
        </Providers>
      </body>
    </html>
  );
}
