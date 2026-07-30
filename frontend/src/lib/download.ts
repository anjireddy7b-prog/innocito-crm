import { api } from '@/lib/api';

/**
 * Downloads a file from a protected /api endpoint. This CANNOT be done with
 * `window.open(url)` — the app authenticates with a JWT sent as an
 * `Authorization: Bearer` header (see lib/api.ts), and a plain browser
 * navigation triggered by window.open has no way to attach that header, so
 * the request hits the backend unauthenticated and fails. Fetching the file
 * through the same authenticated axios instance used everywhere else, then
 * handing the browser the bytes directly, is what actually works.
 */
export async function downloadFile(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}
