# Matric Nejma 6 — Static Site + Blog + Admin

## Overview
Arabic RTL site for the "Matric Nejma 6" streaming app. Originally a single landing page, now a multi-page blog architecture with a self-managed admin panel. Pure static HTML/CSS/Vanilla JS served by a custom Node.js server (no frameworks, no `package.json`).

## Project Structure
### Pages
- `index.html` — Main landing page ("Featured Base"). Hosts the original streaming app pitch.
- `blog.html` — Blog hub with search, category chips and card grid (sports / tech / legal).
- `post.html` — Article template (TOC, reading time, related posts, JSON-LD Article schema).
- `privacy.html` — Privacy policy.
- `contact.html` — Contact form (POSTs to `/api/messages`).
- `admin.html` — Admin panel (login, dashboard, messages, posts, settings).

### Assets
- `assets/css/blog.css` — Shared stylesheet with CSS-variable theming (dark default, `html.light` override).
- `assets/js/posts.js` — Shared front-end engine (header nav, mobile menu, theme toggle with `?theme=light|dark` URL param, blog hub renderer, post renderer).
- `assets/js/admin.js` — Admin panel logic (auth, CRUD, toast notifications, CSV export).

### Backend / data
- `server.js` — Node 20 (builtins only) static file server **plus** JSON API.
- `data/posts.json` — Source of truth for all blog posts (admin can CRUD).
- `data/messages.json` — Inbound contact-form messages.
- `data/admin.json` — Hashed admin password (scrypt). Direct HTTP access blocked.

### Misc
- `sw.js` — Service-worker registration (legacy from original landing page).
- `google612d7a045e6fb654.html` — Google site verification file.

## API Endpoints
- `POST /api/messages` — Public; contact form. Honeypot field, JSON body, in-memory rate-limit.
- `POST /api/admin/login` — Returns `{ token, expiresIn }`. 24h sessions in memory.
- `GET  /api/admin/check` — Validate Bearer token.
- `GET  /api/admin/stats` — Dashboard counters.
- `GET/PATCH/DELETE /api/admin/messages[/:id]` — Manage submissions.
- `GET/POST/PUT/DELETE /api/admin/posts[/:slug]` — Manage blog posts (writes back to `data/posts.json`).
- `POST /api/admin/password` — Change admin password.

All admin endpoints require `Authorization: Bearer <token>` header.

## Theming
Dark mode is the default. A toggle in the navbar adds/removes `.light` on `<html>`, persisted in `localStorage` (`mn6-theme`). URL param `?theme=light|dark` takes precedence and writes through to `localStorage`.

`index.html` uses an inline `<style>` block with `--brand-*` CSS variables. Both the dark default and the `html.light` override are defined there so theme switching works consistently across the entire landing page (hero gradient, surfaces, body text, secondary buttons, footer).

`blog.css` uses `--bg`, `--surface`, `--text`, etc. and switches the same way.

## Replit Setup
- Module: `nodejs-20`.
- Workflow `Start application` runs `node server.js`, listens on `0.0.0.0:5000` (Replit webview port).
- Server explicitly binds `0.0.0.0`, sets `Content-Length` on every response, supports `HEAD` requests, and gracefully shuts down on `SIGTERM`/`SIGINT`.
- Static serving blocks direct access to `data/` and `server.js`; only `data/posts.json` is publicly readable.
- Default admin password is `admin123` (set on first boot if `data/admin.json` is missing). Override at any time via the `ADMIN_PASSWORD` environment variable, or change it from the admin Settings tab.
- Deployment target: `autoscale`, run command `node server.js`.

## Known Quirks
- Replit's workflow port watcher occasionally fails to detect port 5000 even when the server is fully listening. Removing and re-creating the workflow (same config) reliably brings it back.
