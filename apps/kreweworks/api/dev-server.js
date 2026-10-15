'use strict';
// Local development server: serves ../app and runs the Functions handlers in-process (no Core Tools needed).
// Usage: PORTAL_DEV_PRINCIPAL='{"upn":"you@bayoudemo.example","name":"You","tid":"00000000-0000-4000-8000-00000000d3e0"}' node dev-server.js
// The dev principal is auto-granted admin when PORTAL_BOOTSTRAP_ADMINS includes it.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('@azure/functions');
const { collect } = require('./test/harness');

process.env.PORTAL_DATA_DIR = process.env.PORTAL_DATA_DIR || path.join(__dirname, '.data');
const routes = collect(app, () => require('./src/index'));
const APP_DIR = path.join(__dirname, '..', 'app');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const result = await routes.dispatch(req.method, url, Buffer.concat(chunks), req.headers);
    res.writeHead(result.status || 200, result.headers || {});
    res.end(result.body);
    return;
  }
  if (url.pathname === '/.auth/me') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ clientPrincipal: null })); return; }
  let file = path.join(APP_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(APP_DIR, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const port = parseInt(process.env.PORT || '4280', 10);
server.listen(port, () => console.log(`KreweWorks dev server: http://localhost:${port}  (data: ${process.env.PORTAL_DATA_DIR})`));
