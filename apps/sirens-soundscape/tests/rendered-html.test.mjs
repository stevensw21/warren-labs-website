import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

test("builds the complete Siren’s Soundscape studio surface", async () => {
  const [page, studio, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/soundscape-app.tsx", import.meta.url), "utf8"),
    stat(new URL("../dist/server/index.js", import.meta.url)),
  ]);

  assert.match(page, /SoundscapeApp/);
  assert.match(studio, /Siren’s Soundscape/);
  assert.match(studio, /Session/);
  assert.match(studio, /Library/);
  assert.match(studio, /Stop All/);
  assert.match(studio, /YouTube Sources/);
  assert.match(studio, /One-Shots/);
  assert.doesNotMatch(`${page}\n${studio}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
  assert.ok(worker.size > 10_000);
});

test("ships finished metadata, policy pages, responsive styling, and social image", async () => {
  const [layout, page, css, packageJson, privacy, terms, social] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
    stat(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(layout, /og\.png/);
  assert.match(layout, /summary_large_image/);
  assert.match(page, /SoundscapeApp/);
  assert.match(css, /--copper:\s*#c87532/i);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(privacy, /Google API Services User Data Policy/);
  assert.match(terms, /YouTube playback/);
  assert.ok(social.size > 10_000);

  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
