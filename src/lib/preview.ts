const TEXT_MAX_EDIT_BYTES = 2 * 1024 * 1024;

const OFFICE_EXTENSIONS = new Set([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
]);

const OFFICE_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

export type PreviewMode = 'direct' | 'office' | null;

export function isOfficeDocument(mimeType: string | null, filename: string): boolean {
  const mime = mimeType || guessMime(filename);
  if (OFFICE_MIMES.has(mime)) return true;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? OFFICE_EXTENSIONS.has(ext) : false;
}

export function getPreviewMode(mimeType: string | null, filename: string): PreviewMode {
  if (isOfficeDocument(mimeType, filename)) return 'office';
  if (isDirectPreviewable(mimeType, filename)) return 'direct';
  return null;
}

function isDirectPreviewable(mimeType: string | null, filename: string): boolean {
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

export function isPreviewable(mimeType: string | null, filename: string): boolean {
  return getPreviewMode(mimeType, filename) !== null;
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
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
  };
  return (ext && map[ext]) || 'application/octet-stream';
}

export function getOfficeEmbedUrl(publicFileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicFileUrl)}`;
}

export function contentDisposition(filename: string, inline: boolean): string {
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export { TEXT_MAX_EDIT_BYTES };
