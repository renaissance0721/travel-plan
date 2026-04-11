# Travel Planner Journal

A lightweight travel planning web app designed for Cloudflare Pages deployment.

## What this version already does

- Create multiple trips
- Generate trip days automatically from a start and end date
- Add day-by-day itinerary items
- Track time, route, transport, estimated cost, actual cost, and notes
- Edit every item independently
- Archive a finished trip into a journal view
- Duplicate an archived trip into a fresh new plan
- Save data locally in the browser using localStorage

## Local development

```bash
npm.cmd install
npm.cmd run dev
```

## Production build

```bash
npm.cmd run build
```

## Deploy to Cloudflare Pages

1. Push this project to GitHub.
2. In Cloudflare Pages, create a new project connected to that repo.
3. Use these build settings:
   - Build command: `npm.cmd run build` on Windows locally, or `npm run build` in Cloudflare
   - Build output directory: `dist`
4. Deploy.

The `_redirects` file is included so the SPA works correctly after deployment.

## Current storage model

This first version stores trip data in `localStorage`, which means:

- Data persists in the same browser on the same device
- No login is required
- Data is not yet synced across devices

## Cloudflare upgrade path

When you are ready for real cloud persistence, use:

- Cloudflare Pages for the front end
- Cloudflare Workers or Pages Functions for API routes
- Cloudflare D1 for structured trip data
- Cloudflare R2 later for images and receipts

A starter D1 schema is included at `db/schema.sql`.
