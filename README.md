# Matric Nejma 6

A blog and admin panel for Matric Nejma 6, built with Node.js serverless function for Vercel.

## Features

- User-facing blog with posts
- Contact form
- Admin panel for managing posts and messages
- API for CRUD operations

## Deployment to Vercel

1. Push the code to GitHub.
2. Connect the repository to Vercel.
3. Vercel will automatically detect the Node.js app and deploy it.

The app uses `package.json` for dependencies and `vercel.json` for routing.

## Admin Access

- Default password: `admin123`
- Change it from the admin panel after login.
- Access at `/admin.html`

## Data Storage

Data is stored in JSON files in the `data/` directory. Note that on Vercel serverless, data is ephemeral and will reset on redeploy or cold starts. For production persistence, consider using a database.

## Sessions

Admin sessions are in-memory and may not persist across serverless instances. For production, use persistent storage.

## Development

Run locally with:

```bash
npm start
```

But for local development, the serverless function won't run directly. Use a local server or adapt.
