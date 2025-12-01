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

const deriveApiBaseUrl = (backendUrl) => {
  if (!backendUrl || !backendUrl.trim()) {
    return "/api";
  }

  const sanitized = sanitizeUrl(backendUrl.trim());
  const parsedUrl = ensureAbsoluteUrl(sanitized);

  if (parsedUrl) {
    const pathname = parsedUrl.pathname || "/";
    if (pathname === "" || pathname === "/" || pathname === "//") {
      return `${sanitized}/api`;
    }
    return sanitized;
  }

  if (/\/api$/i.test(sanitized)) {
    return sanitized;
  }

  return `${sanitized}/api`;
};

export const API_BASE_URL = deriveApiBaseUrl(import.meta.env.VITE_BACKEND_URL);


export function cn(...inputs) {
  return twMerge(clsx(inputs));
}