// API helper to handle backend URL
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

// Debug: Log backend URL on module load
console.log('[API] VITE_BACKEND_URL:', import.meta.env.VITE_BACKEND_URL);
console.log('[API] Using BACKEND_URL:', BACKEND_URL);

/**
 * Get the full API URL for a given path
 * @param path - API path (e.g., '/api/pools')
 * @returns Full URL to the API endpoint
 */
export function getApiUrl(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // If BACKEND_URL is set (production), use it
  if (BACKEND_URL) {
    return `${BACKEND_URL}/${cleanPath}`;
  }

  // Otherwise use relative path (development with proxy)
  return `/${cleanPath}`;
}

/**
 * Fetch wrapper that automatically adds the backend URL
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = getApiUrl(path);
  return fetch(url, options);
}

// Export the backend URL for cases where it's needed directly
export const backendUrl = BACKEND_URL;
