import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const sanitizeUrl = (url) => url.replace(/\/+$/, "");

const ensureAbsoluteUrl = (url) => {
  try {
    return new URL(url);
  } catch (error) {
    return null;
  }
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_LAN_HOST = "localhost";
const DEFAULT_LAN_BASE = `http://${DEFAULT_LAN_HOST}:8000`;

const deriveApiBaseUrl = (backendUrl) => {
  const fallback = `${DEFAULT_LAN_BASE}/api`;

  if (!backendUrl || !backendUrl.trim()) {
    return fallback;
  }

  const sanitized = sanitizeUrl(backendUrl.trim());
  const parsedUrl = ensureAbsoluteUrl(sanitized);

  if (parsedUrl) {
    const windowHost = typeof window !== "undefined" ? window.location.hostname : null;
    const url = new URL(parsedUrl.toString());
    if (LOCAL_HOSTNAMES.has(url.hostname)) {
      url.hostname = windowHost && !LOCAL_HOSTNAMES.has(windowHost) ? windowHost : DEFAULT_LAN_HOST;
    }
    const pathname = url.pathname || "/";
    if (pathname === "" || pathname === "/" || pathname === "//") {
      return `${sanitizeUrl(url.origin)}/api`;
    }
    return sanitizeUrl(`${url.origin}${pathname}`);
  }

  if (/\/api$/i.test(sanitized)) {
    return sanitized;
  }

  return `${sanitized}/api`;
};

export const API_BASE_URL = deriveApiBaseUrl(import.meta.env.VITE_BACKEND_URL);
console.log("API_BASE_URL:", API_BASE_URL);

const deriveAssetBaseUrl = () => {
  const override = (import.meta.env.VITE_ASSET_BASE_URL || "").trim();
  const backend = (import.meta.env.VITE_BACKEND_URL || "").trim();
  const windowHost = typeof window !== "undefined" ? window.location.hostname : null;

  if (override) {
    const parsedOverride = ensureAbsoluteUrl(override);
    if (parsedOverride) {
      return sanitizeUrl(parsedOverride.origin);
    }
  }

  // Prefer current origin in the browser so static assets served from the frontend public folder resolve correctly.
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = sanitizeUrl(window.location.origin);
    if (origin) {
      return origin;
    }
  }

  if (backend) {
    const parsedBackend = ensureAbsoluteUrl(backend);
    if (parsedBackend) {
      const swapLoopback = windowHost && LOCAL_HOSTNAMES.has(parsedBackend.hostname);
      const hostname = swapLoopback
        ? windowHost
        : LOCAL_HOSTNAMES.has(parsedBackend.hostname)
          ? DEFAULT_LAN_HOST
          : parsedBackend.hostname;
      const port = parsedBackend.port || (parsedBackend.protocol === "https:" ? "443" : "");
      const origin = `${parsedBackend.protocol}//${hostname}${port ? `:${port}` : ""}`;
      return sanitizeUrl(origin);
    }
  }

  if (DEFAULT_LAN_BASE) {
    return sanitizeUrl(DEFAULT_LAN_BASE);
  }

  if (typeof window !== "undefined") {
    return sanitizeUrl(window.location.origin);
  }

  return "";
};

export const ASSET_BASE_URL = deriveAssetBaseUrl();

const deriveBackendOrigin = () => {
  const backend = (import.meta.env.VITE_BACKEND_URL || "").trim();
  const parsed = ensureAbsoluteUrl(backend);
  if (parsed) {
    return sanitizeUrl(parsed.origin);
  }
  try {
    const apiUrl = new URL(API_BASE_URL);
    return sanitizeUrl(apiUrl.origin);
  } catch (error) {
    return "";
  }
};

const BACKEND_ORIGIN = deriveBackendOrigin();

export const normalizeAssetUrl = (url) => {
  if (!url) return "";

  // Normalize Vite public-prefix usage: /public/... should be served from root.
  let href = url;
  if (typeof href === "string") {
    href = href.replace(/^(https?:\/\/[^/]+)?\/public(?=\/)/i, "$1");
  }

  // Keep backend-served assets (cover uploads, dynamic Assets) on the backend origin.
  if (
    typeof href === "string" &&
    (href.startsWith("/cover-uploads") || href.startsWith("/Assets"))
  ) {
    if (BACKEND_ORIGIN) {
      return sanitizeUrl(`${BACKEND_ORIGIN}${href}`);
    }
    return href;
  }

  const base = ASSET_BASE_URL;

  try {
    const parsed = new URL(href);
    const pathname = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    // If backend returned a loopback URL for backend assets, swap to backend origin.
    if (
      LOCAL_HOSTNAMES.has(parsed.hostname) &&
      (pathname.startsWith("/cover-uploads") || pathname.startsWith("/Assets")) &&
      BACKEND_ORIGIN
    ) {
      return sanitizeUrl(`${BACKEND_ORIGIN}${pathname}`);
    }

    if (LOCAL_HOSTNAMES.has(parsed.hostname) && base) {
      return sanitizeUrl(`${base}${parsed.pathname}${parsed.search}${parsed.hash}`);
    }
    return parsed.toString();
  } catch (error) {
    if (base && typeof href === "string" && href.startsWith("/")) {
      return sanitizeUrl(`${base}${href}`);
    }
    return href;
  }
};


export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
