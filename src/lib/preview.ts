const TEXT_MAX_EDIT_BYTES = 2 * 1024 * 1024;

export function isPreviewable(mimeType: string | null, filename: string): boolean {
  const mime = mimeType || guessMime(filename);
  if (mime.startsWith('image/')) return true;
  if (mime.startsWith('video/')) return true;
  if (mime.startsWith('audio/')) return true;
  if (mime === 'application/pdf') return true;
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/json') return true;
  if (mime === 'application/javascript') return true;
  return false;
}

export function isEditable(mimeType: string | null, filename: string, size: number): boolean {
  if (size > TEXT_MAX_EDIT_BYTES) return false;
  const mime = mimeType || guessMime(filename);
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/json') return true;
  if (mime === 'application/javascript') return true;
  if (/\.(md|txt|json|js|ts|css|html|xml|yaml|yml|csv|log|env|toml|ini)$/i.test(filename)) {
    return true;
  }
  return false;
}

export function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    js: 'application/javascript',
    ts: 'text/typescript',
    css: 'text/css',
    html: 'text/html',
  };
  return (ext && map[ext]) || 'application/octet-stream';
}

export function contentDisposition(filename: string, inline: boolean): string {
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export { TEXT_MAX_EDIT_BYTES };
