export function getApiBaseUrl(): string {
  // Use the environment variable if available, otherwise fall back to localhost for development
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
}
