# Matric Nejma 6 — Static Site

## Overview
Single-page Arabic landing site (RTL) for the "Matric Nejma 6" streaming app, served as a static HTML file. Tailwind CSS is loaded via CDN inside `index.html`.

## Project Structure
- `index.html` — main landing page (the entire site).
- `sw.js` — service worker registration script.
- `google612d7a045e6fb654.html` — Google site verification file.
- `server.js` — minimal Node.js static file server used to serve the site in development and production on Replit.

## Replit Setup
- Module: `nodejs-20`.
- Workflow `Start application` runs `node server.js` and listens on `0.0.0.0:5000` (the only port exposed by the Replit webview).
- The static server disables caching in development so the iframe preview always shows the latest content, and falls back to `index.html` for unknown paths.
- Deployment target: `autoscale`, run command `node server.js`.
