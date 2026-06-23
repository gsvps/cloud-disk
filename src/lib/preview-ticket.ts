const PREVIEW_TICKET_PREFIX = 'preview-ticket:';
const PREVIEW_TICKET_TTL = 600; // 10 分钟

export interface PreviewTicketData {
  r2Key: string;
  name: string;
  mimeType: string | null;
}

export async function createPreviewTicket(
  kv: KVNamespace,
  data: PreviewTicketData
): Promise<string> {
  const ticket = crypto.randomUUID().replace(/-/g, '');
  await kv.put(`${PREVIEW_TICKET_PREFIX}${ticket}`, JSON.stringify(data), {
    expirationTtl: PREVIEW_TICKET_TTL,
  });
  return ticket;
}

export async function consumePreviewTicket(
  kv: KVNamespace,
  ticket: string
): Promise<PreviewTicketData | null> {
  const key = `${PREVIEW_TICKET_PREFIX}${ticket}`;
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PreviewTicketData;
  } catch {
    return null;
  }
}
