import http from 'node:http';

/**
 * Start a deterministic remote page used by browser tests.  It deliberately
 * uses a normal HTML form and a real HTTP POST so the test exercises browser
 * navigation and form submission rather than a mocked page or fetch call.
 */
export function createRemoteFormServer() {
  let server;
  let submittedValue = null;
  let remoteGetCount = 0;
  let remoteReadyCount = 0;

  const start = () => new Promise((resolve, reject) => {
    server = http.createServer((request, response) => {
      if (request.method === 'GET' && (request.url === '/' || request.url === '/remote')) {
        remoteGetCount += 1;
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(`<!doctype html>
<html><head><title>Controlled remote form</title></head>
<body><main><h1>Controlled remote form</h1>
<form method="post" action="/submit" data-testid="remote-form">
<label for="value">Value</label><input id="value" name="value" autofocus required>
<button type="submit">Submit value</button></form></main>
<script>window.addEventListener('load', () => { document.getElementById('value').focus(); fetch('/ready'); });</script>
</body></html>`);
        return;
      }

      if (request.method === 'GET' && request.url === '/ready') {
        remoteReadyCount += 1;
        response.writeHead(204).end();
        return;
      }

      if (request.method === 'POST' && request.url === '/submit') {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', chunk => { body += chunk; });
        request.on('end', () => {
          submittedValue = new URLSearchParams(body).get('value');
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          response.end(`<!doctype html><html><head><title>Submitted</title></head>
<body><main><h1>Submitted</h1><output data-testid="submitted-value">${escapeHtml(submittedValue ?? '')}</output></main></body></html>`);
        });
        return;
      }

      response.writeHead(404).end('Not found');
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

  return {
    start,
    get submittedValue() { return submittedValue; },
    get remoteGetCount() { return remoteGetCount; },
    get remoteReadyCount() { return remoteReadyCount; },
    close: () => new Promise(resolve => {
      if (!server) return resolve();
      server.close(() => resolve());
      // Chromium may keep speculative TCP connections open after submission.
      // Teardown must not wait for those unrelated sockets to time out.
      server.closeAllConnections();
    }),
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
