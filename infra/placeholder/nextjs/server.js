/**
 * Minimal HTTP server used as a placeholder image for DigitalOcean App Platform.
 *
 * Purpose: App Platform validates that the DOCR image tag exists AND that the
 * container starts and passes a health check before Terraform considers the app
 * resource created.  This placeholder satisfies both requirements so
 * `terraform apply` can succeed on a brand-new (empty) registry.
 *
 * The real voyageai-nextjs image is pushed by the CI docker-push-nextjs job
 * and overwrites this placeholder on the same :latest tag.
 */
const http = require('http');

http.createServer((req, res) => {
  // Satisfy the App Platform health-check which hits /api/auth/csrf
  if (req.url === '/api/auth/csrf') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ csrfToken: 'placeholder' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('placeholder');
}).listen(3000, '0.0.0.0');
