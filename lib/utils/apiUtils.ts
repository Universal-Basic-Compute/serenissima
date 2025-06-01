export function getBackendBaseUrl(): string {
  // Use the environment variable if available, otherwise fall back to localhost for development
  return process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:5000';
}
