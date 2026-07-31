import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for using Siren’s Soundscape.",
};

export default function TermsPage() {
  return (
    <main className="policy-page">
      <a className="policy-back" href="/">← Return to Siren’s Soundscape</a>
      <h1>Terms</h1>
      <p className="policy-updated">Last updated July 31, 2026</p>
      <p>Siren’s Soundscape is a personal tabletop roleplaying utility provided by Warren Labs. Use it only with media you are authorized to access and play.</p>

      <h2>YouTube playback</h2>
      <p>YouTube sources are played through YouTube’s official embedded player. The tool does not extract, download, cache, or separately distribute YouTube audio. A playing video remains visible in the interface, and playback pauses when the page is hidden. YouTube’s own terms and playback restrictions continue to apply.</p>

      <h2>Uploaded audio</h2>
      <p>You are responsible for uploaded files and for ensuring you have permission to store and play them. Do not upload unlawful, infringing, or malicious material.</p>

      <h2>Availability</h2>
      <p>The tool is provided as-is for personal use. External services may change, become unavailable, reject a source, or require reconnection. No uninterrupted availability is promised.</p>

      <h2>Contact</h2>
      <p>Questions can be sent to <a href="mailto:hello@warren-labs.com">hello@warren-labs.com</a>.</p>
    </main>
  );
}
