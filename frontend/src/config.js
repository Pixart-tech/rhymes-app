const sanitizeUrl = (url) => url.replace(/\/+$/, '');

const computeBackendUrl = () => {
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  if (envUrl && envUrl.trim()) {
    return sanitizeUrl(envUrl.trim());
  }

  if (typeof window !== 'undefined' && window.location) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'REACT_APP_BACKEND_URL is not set. Falling back to http://localhost:8000 for development.',
      );
      return 'http://localhost:8000';
    }

    console.warn(
      'REACT_APP_BACKEND_URL is not set. Falling back to current origin for backend requests.',
    );
    return sanitizeUrl(window.location.origin);
  }

  console.warn(
    'REACT_APP_BACKEND_URL is not set and window is unavailable. Falling back to http://localhost:8000.',
  );
  return 'http://localhost:8000';
};

export const BACKEND_URL = computeBackendUrl();
export const API_BASE_URL = `${BACKEND_URL}/api`;
