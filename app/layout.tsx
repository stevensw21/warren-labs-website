import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warren Labs | Engineering. Automation. Exploration.",
  description: "Practical tools for science, engineering, diving, and AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
