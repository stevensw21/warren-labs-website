import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Siren’s Soundscape handles scenes, audio uploads, and connected YouTube data.",
};

export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <a className="policy-back" href="/">← Return to Siren’s Soundscape</a>
      <h1>Privacy</h1>
      <p className="policy-updated">Last updated July 31, 2026</p>
      <p>Siren’s Soundscape is a private Warren Labs tool for its owner. It stores only the information needed to save scenes, serve uploaded audio, and—with permission—read the owner’s YouTube playlists.</p>

      <h2>Information the tool stores</h2>
      <ul>
        <li>Scene names, source settings, volume levels, and loop choices.</li>
        <li>Audio files you upload, plus their filename, type, size, and upload date.</li>
        <li>When YouTube is connected: the verified Google account email, encrypted OAuth tokens, and playlist/video metadata requested from YouTube.</li>
      </ul>

      <h2>How the information is used</h2>
      <p>Data is used only to operate this soundboard. Siren’s Soundscape does not sell personal information, run advertising, or download and re-host YouTube audio. YouTube videos play through YouTube’s official embedded player.</p>

      <h2>Google and YouTube data</h2>
      <p>The tool requests read-only YouTube access. Private playlist metadata may be used to build a local playback queue, but private videos and videos that prohibit embedding are skipped. Google access tokens remain on the server and are encrypted at rest.</p>
      <p>Use of information received from Google APIs follows the Google API Services User Data Policy. You can review the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>, <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, and your <a href="https://security.google.com/settings/security/permissions">Google account permissions</a>.</p>

      <h2>Deletion and disconnection</h2>
      <p>“Disconnect YouTube” revokes the available Google token and removes the tool’s stored Google connection immediately. It does not delete anything from YouTube. Uploaded audio can be deleted from the library; deleting it removes both the stored file and its metadata.</p>

      <h2>Contact</h2>
      <p>Questions about this policy can be sent to <a href="mailto:hello@warren-labs.com">hello@warren-labs.com</a>.</p>
    </main>
  );
}
