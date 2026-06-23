import { Hono } from 'hono';
import type { Env } from './env';
import auth from './routes/auth';
import files from './routes/files';
import user from './routes/user';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) =>
  c.json({ success: true, data: { status: 'ok', app: c.env.APP_NAME } })
);

app.route('/api/auth', auth);
app.route('/api/user', user);
app.route('/api/files', files);

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  let path = url.pathname;

  if (path === '/') path = '/index.html';
  if (!path.includes('.')) path = '/index.html';

  const asset = await c.env.ASSETS.fetch(new URL(path, url.origin));
  if (asset.status === 404 && path !== '/index.html') {
    return c.env.ASSETS.fetch(new URL('/index.html', url.origin));
  }
  return asset;
});

export default app;
