"""
Minimal HTTP server used as a placeholder image for DigitalOcean App Platform.

Purpose: App Platform validates that the DOCR image tag exists AND that the
container starts and passes a health check before Terraform considers the app
resource created. This placeholder satisfies both requirements so `terraform
apply` can succeed on a brand-new (empty) registry.

The real voyageai-langgraph image is pushed by the CI docker-push job and
overwrites this placeholder on the same :latest tag.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 — HTTP method names are uppercase by convention
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"placeholder")

    def log_message(self, *args):  # suppress access logs
        pass


if __name__ == "__main__":
    HTTPServer(("", 8000), Handler).serve_forever()
