import { promises as fs } from 'fs';
import path from 'path';

const UPSTREAM_ORIGIN = 'https://backend.serenissima.ai';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

/**
 * Serves a legacy asset from the old production backend, mirroring it into
 * public/ on first successful fetch so the static file wins on later requests.
 *
 * urlPrefix is the public URL namespace ('/public_assets' or '/public/assets');
 * segments are the catch-all path parts after it.
 */
export async function serveLegacyAsset(urlPrefix: string, segments: string[]): Promise<Response> {
  const relPath = segments.join('/');
  if (relPath.includes('..')) {
    return new Response('Invalid path', { status: 400 });
  }

  const localFile = path.join(process.cwd(), 'public', ...urlPrefix.split('/').filter(Boolean), ...segments);
  const ext = path.extname(relPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

  // Static files in public/ normally win over this route; this read covers
  // the race where the mirror file was written after the route was matched.
  try {
    const cached = await fs.readFile(localFile);
    return new Response(new Uint8Array(cached), {
      status: 200,
      headers: { 'Content-Type': contentType, 'X-Asset-Source': 'mirror' },
    });
  } catch {
    // Not mirrored yet — fetch upstream.
  }

  const upstreamUrl = `${UPSTREAM_ORIGIN}${urlPrefix}/${relPath}`;
  const upstream = await fetch(upstreamUrl, { cache: 'no-store' });
  if (!upstream.ok) {
    return new Response(`Upstream ${upstream.status} for ${upstreamUrl}`, { status: upstream.status });
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  await fs.writeFile(localFile, bytes);

  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': contentType, 'X-Asset-Source': 'upstream-mirrored' },
  });
}
