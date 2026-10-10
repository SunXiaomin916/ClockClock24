'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8765);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.jpg':'image/jpeg', '.md':'text/plain; charset=utf-8', '.txt':'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const ext = path.extname(target);
    if (!types[ext]) { res.writeHead(404).end(); return; }
    fs.readFile(target, (error, data) => {
      if (error) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, {'Content-Type': types[ext], 'Cache-Control':'no-store'}); res.end(data);
    });
  } catch (_) { res.writeHead(400).end('Bad request'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set PORT to another port.` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`ClockClock 24: http://127.0.0.1:${port}/?dev=1`));
