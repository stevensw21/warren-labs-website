# Siren’s Soundscape

Siren’s Soundscape is Warren Labs’ private tabletop roleplaying soundboard. It mixes visible YouTube players, uploaded ambience, and restart-on-press one-shots in saved scenes.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
npm run build
```

The app is an isolated Cloudflare Worker inside the Warren Labs GitHub repository. `wrangler.jsonc` declares its D1 database (`DB`), private R2 bucket (`AUDIO`), and custom domain. `.dev.vars` enables an explicit loopback-only authentication bypass and is never committed.

## Production infrastructure

Create the resources once, replace the placeholder D1 UUID in `wrangler.jsonc`, and apply the committed migration:

```bash
npx wrangler d1 create sirens-soundscape-db
npx wrangler r2 bucket create sirens-soundscape-audio
npx wrangler d1 migrations apply sirens-soundscape-db --remote
```

Connect the `warren-labs-website` repository to Cloudflare Workers Builds with:

- Production branch: `main`
- Root directory: `apps/sirens-soundscape`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

`soundscape.warren-labs.com` is a Worker Custom Domain. Cloudflare creates its DNS record and TLS certificate from `wrangler.jsonc`; do not create a separate CNAME.

## Private access and runtime values

Protect the entire hostname with a Cloudflare Access self-hosted application that allows only the owner email. The Worker also verifies the Access JWT signature, issuer, audience, expiry, and exact email before forwarding a request.

Set these non-secret Worker variables in Cloudflare, never in source control:

- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `ACCESS_ALLOWED_EMAIL`
- `SOUNDSCAPE_OWNER_ID`
- `PUBLIC_APP_ORIGIN` (`https://soundscape.warren-labs.com`)
- `GOOGLE_CLIENT_ID`
- `OWNER_GOOGLE_EMAIL`

Set these as encrypted Worker secrets:

- `GOOGLE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` (at least 32 characters)

The Google OAuth callback is `https://soundscape.warren-labs.com/api/google/oauth/callback`. The app requests only `openid`, `email`, and YouTube read-only access.

## Behavior

- YouTube playback never starts on mount. Playing videos reveal a compliant embedded player; paused and stopped sources collapse.
- Hiding the document pauses YouTube playback without automatically resuming it.
- Private playlist IDs are materialized server-side into eligible public or unlisted video queues. Private, unavailable, and non-embeddable videos are skipped with explicit reasons.
- Uploaded MP3, M4A, AAC, and WAV files are stored in R2 with a 90 MB per-file limit.
- D1 stores owner-scoped scene configuration, upload metadata, and encrypted Google connection tokens.

## Commands

- `npm run dev` — local development server
- `npm run build` — production build
- `npm test` — build and rendered-output checks
- `npm run db:generate` — generate Drizzle migrations
- `npm run cf-typegen` — refresh Cloudflare binding/runtime types
- `npm run deploy` — build and deploy with Vinext and Wrangler
