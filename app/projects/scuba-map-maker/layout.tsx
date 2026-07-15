import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scuba Map Maker | Warren Labs",
  description: "Create, calibrate, and print dive-site maps from shoreline traces, bearings, distances, and depths.",
};

export default function ScubaMapMakerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
