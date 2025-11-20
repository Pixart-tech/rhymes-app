# Rhymes App Setup Guide

## Prerequisites
Ensure the following tools and services are available before working with the project:

- **Python 3.10 or newer** for running the FastAPI backend.
- **Node.js and Yarn** for managing and starting the React frontend.
- **Access to a MongoDB instance**, either hosted or running locally.

## Backend Setup
The FastAPI service is defined in [`backend/server.py`](backend/server.py) and expects specific environment configuration and runtime steps:

1. **Environment variables**
   - `MONGO_URL` – connection string to your MongoDB deployment.
   - `DB_NAME` – database name used by the application.
   - `CORS_ORIGINS` – optional comma-separated list of allowed origins for cross-origin requests.
   - `TRUSTED_PROXY_HOSTS` – optional comma-separated list of proxy hostnames/IPs that are allowed to forward headers such as `X-Forwarded-For`. Defaults to `*`, which trusts all proxies (useful for VS Code and similar port forwarding solutions).
2. **Create and activate a virtual environment** (recommended):
   ```bash
   python -m venv backend/.venv
   source backend/.venv/bin/activate  # On Windows use: backend\.venv\Scripts\activate
   ```
3. **Install dependencies** with:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. **Run the application** from within the `backend/` directory using:
   ```bash
   cd backend
   uvicorn server:app --reload
   ```

Before starting the FastAPI service, make sure a MongoDB server is available. You can run it locally at `mongodb://localhost:27017` or supply a hosted MongoDB URL via `MONGO_URL`.

## Frontend Setup
The UI is built with Vite and expects the backend location to be provided via an environment variable:

1. Create `frontend/.env.local` (or `.env`) and set the backend override and Firebase auth values:
   ```env
   VITE_BACKEND_URL=http://localhost:8000
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```
   The `VITE_BACKEND_URL` value ensures login requests target the FastAPI service instead of the Vite dev server.
2. Install frontend dependencies with `yarn install` inside the `frontend/` directory.
3. Launch the development server with `yarn dev`. The Vite server defaults to port `5173`.

## Running the Application
Run the backend (`uvicorn server:app --reload`) and the Vite frontend (`yarn dev`) at the same time. Open `http://localhost:5173/#/` in a private/incognito window or after clearing `localStorage` to see the embedded login form in `RhymesWorkflowApp`.
