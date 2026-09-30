import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import { Toasts } from "@/components/ui";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow-condensed" });

export const metadata: Metadata = {
  title: "Tournée des calendriers",
  description: "Suivi en temps réel de la tournée des calendriers, rue par rue.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14223A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>
        {children}
        <Toasts />
      </body>
    </html>
  );
}
