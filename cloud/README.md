# TorchTrack Community Prices

Free Cloudflare Worker + D1 service for anonymous SS13 Afterlight price samples.

Only item ID, item name, FE price, observation time, season, and a hashed random contributor ID are stored. Account names, character names, game logs, and inventory contents are never uploaded.

## Deploy

1. Run `npm install` in this folder.
2. Run `npx wrangler login` and sign in to the Cloudflare account that should own the service.
3. Run `npx wrangler d1 create torchtrack-prices`.
4. Put the returned database ID in `wrangler.jsonc`.
5. Run `npm run db:remote`.
6. Run `npx wrangler secret put INGEST_KEY` and choose a private sharing key for your friends.
7. Run `npm run deploy`.

The service exposes `GET /health`, authenticated `POST /v1/samples`, and public read-only `GET /v1/prices?season=ss13-afterlight`.
