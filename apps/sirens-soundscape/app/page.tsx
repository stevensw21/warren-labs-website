import type { Metadata } from "next";
import { SoundscapeApp } from "./components/soundscape-app";

export const metadata: Metadata = {
  title: "Siren’s Soundscape | Warren Labs",
  description:
    "A private tabletop roleplaying soundboard for layered YouTube playlists, ambience, and one-shot audio.",
  other: {
    "theme-color": "#11161a",
  },
};

export default function Home() {
  return <SoundscapeApp />;
}
