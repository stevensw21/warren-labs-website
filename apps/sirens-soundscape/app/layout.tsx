import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "soundscape.warren-labs.com";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const description = "A private tabletop roleplaying soundboard for layered YouTube playlists, ambience, and one-shot audio.";
  const imageUrl = new URL("/og.png", base);

  return {
    metadataBase: base,
    title: {
      default: "Siren’s Soundscape | Warren Labs",
      template: "%s | Siren’s Soundscape",
    },
    description,
    applicationName: "Siren’s Soundscape",
    alternates: { canonical: base },
    openGraph: {
      title: "Siren’s Soundscape",
      description: "Build the atmosphere. Run the room.",
      type: "website",
      siteName: "Warren Labs",
      url: base,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Siren’s Soundscape tabletop audio mixer" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Siren’s Soundscape",
      description: "Build the atmosphere. Run the room.",
      images: [imageUrl],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#11161a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
