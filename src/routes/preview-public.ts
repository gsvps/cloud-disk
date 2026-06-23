import { Hono } from 'hono';
import type { Env } from '../env';
import { consumePreviewTicket } from '../lib/preview-ticket';
import { contentDisposition } from '../lib/preview';
import { jsonFail } from '../lib/response';

export const previewPublicRouter = new Hono<{ Bindings: Env }>();

previewPublicRouter.get('/:ticket', async (c) => {
  const ticket = c.req.param('ticket');
  if (!ticket) return jsonFail(c, 'BAD_REQUEST', '无效预览链接');

  const data = await consumePreviewTicket(c.env.KV, ticket);
  if (!data) return jsonFail(c, 'NOT_FOUND', '预览链接已失效', 404);

  const object = await c.env.R2.get(data.r2Key);
  if (!object) return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);

  const headers = new Headers();
  headers.set('Content-Type', data.mimeType || 'application/octet-stream');
  headers.set('Content-Disposition', contentDisposition(data.name, true));
  if (object.size) headers.set('Content-Length', String(object.size));
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, { headers });
});
