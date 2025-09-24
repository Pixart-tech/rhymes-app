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
The React client reads its backend URL from `frontend/src/App.js`. Configure and start it by following these steps:

1. Create `frontend/.env` with the lines:
   ```env
   REACT_APP_BACKEND_URL=http://localhost:8000
   ```
2. Install frontend dependencies with `yarn install` inside the `frontend/` directory.
3. Launch the development server with `yarn start`, which serves the UI on port 3000 as defined in `frontend/package.json`.

## Running the Application
Keep both the backend (`uvicorn server:app --reload`) and frontend (`yarn start`) processes running. With both services active, open your browser to `http://localhost:3000` to interact with the Rhymes App.
