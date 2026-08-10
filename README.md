# Xcatter

Portable, external farming-session tracker for Torchlight: Infinite. Reads the game's real-time log to track loot drops, zone costs, and session profit without touching the game.

## Features

- Live pickup tracking from the game log (stackables, currencies, compasses)
- Per-map profit, FE drops, and cost accounting (netherrealm resonance, compasses, beacons)
- Item price data from the community Cloudflare price service and TITrack Economy
- Always-on-top mini overlay for in-game viewing
- Automatic updates: installs replace themselves on restart
- Cloudflare Worker + D1 community price sync (anonymous item/price samples only)

## Releases

Portable Windows builds are published to the [Releases](https://github.com/xcattertutter/Xcatter-Releases/releases) page. Each release ships the `.exe` plus a SHA-256 sidecar that the in-app updater validates before installing.

Push a `vX.Y.Z` tag to trigger the [release workflow](.github/workflows/release.yml), which builds `Xcatter-Portable-<version>.exe` and creates the GitHub release automatically.

## Local build

```bash
npm install
npm run desktop:portable
```

Output: `release/Xcatter-Portable-<version>.exe`.

## Development

- `npm run dev` — web (vinext) development
- `desktop/electron.mjs` — Electron main process (log parsing, prices, updates)
- `desktop/overlay.html` + `app/` — UI
- `cloud/` — Cloudflare Worker + D1 community price service

## Privacy

Only item ID, item name, FE price, observation time, season, and a hashed random contributor ID are uploaded. No account, character, or gameplay-log data leaves your PC.
