# Rhymes App Frontend (Vite)

## Prerequisites
- Node.js and Yarn installed.
- Firebase project credentials for Google authentication.

## Environment variables
Create `frontend/.env.local` (or `.env`) with the backend and Firebase values:

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

`VITE_BACKEND_URL` is required so the login POST from the embedded form in `RhymesWorkflowApp` reaches the FastAPI backend.

## Development
1. Install dependencies: `yarn install`
2. Start the dev server: `yarn dev` (defaults to [http://localhost:5173](http://localhost:5173)).
3. Visit `http://localhost:5173/#/` with a clean `localStorage` (or an incognito window) to view the login form. The app uses a hash router, so the `#/` suffix is required.

## Testing and builds
- Run unit checks: `yarn test`
- Build for production: `yarn build`
