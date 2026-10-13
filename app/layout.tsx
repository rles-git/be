import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Be-Electric | EV Charger Finder",
  description: "Find nearby EV charging stations and preview your route.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
