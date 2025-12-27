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

export const normalizeAssetUrl = (url) => {
  if (!url) return "";
  const base = ASSET_BASE_URL;

  try {
    const parsed = new URL(url);
    if (LOCAL_HOSTNAMES.has(parsed.hostname) && base) {
      return sanitizeUrl(`${base}${parsed.pathname}${parsed.search}${parsed.hash}`);
    }
    return parsed.toString();
  } catch (error) {
    if (base && url.startsWith("/")) {
      return sanitizeUrl(`${base}${url}`);
    }
    return url;
  }
};


export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
