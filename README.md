# Matric Nejma 6

A blog and admin panel for Matric Nejma 6, built with Node.js.

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

Data is stored in JSON files in the `data/` directory. Note that on Vercel, data is ephemeral and will reset on redeploy. For persistent data, consider using a database.

## Development

Run locally with:

```bash
npm start
```

The server runs on port 5000 by default, or `process.env.PORT` for Vercel.
