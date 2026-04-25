# ─────────────────────────────────────────────────────────────────────────────
#  VoyageAI — LangGraph Orchestration Service
#
#  Multi-stage build keeps the final image lean (~200 MB vs ~1 GB).
#
#  Stages:
#    1. builder  — installs all dependencies (including build tools)
#    2. runtime  — copies only the installed packages + source; no build tools
#
#  Build:
#    docker build -t voyageai-langgraph:latest ./python/agent_graph
#
#  Run (standalone, pointing at a local Next.js dev server):
#    docker run --rm -p 8000:8000 \
#      -e NEXT_INTERNAL_URL=http://host.docker.internal:3000 \
#      -e INTERNAL_AGENT_SECRET=your-secret \
#      voyageai-langgraph:latest
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

# Prevent .pyc files and enable unbuffered stdout (shows logs immediately)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Install OS-level build deps (needed for some wheels, e.g. cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first so Docker caches this layer when source changes
COPY requirements.txt .

# Install all deps into an isolated prefix so Stage 2 can copy them cleanly
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Tells Python where to look for the installed packages from Stage 1
    PYTHONPATH=/app

WORKDIR /app

# Copy installed packages from builder (no gcc, no apt caches)
COPY --from=builder /install /usr/local

# Copy application source
COPY main.py graph.py client.py contracts.py metrics.py ./

# ── Build-time import validation ──────────────────────────────────────────────
# Catches ModuleNotFoundError, ImportError, and any exception raised at module
# level (e.g. compiled_graph = build_graph() failing due to a langgraph /
# langchain-core version mismatch) before the image is pushed to DOCR.
# A broken image must never reach the registry — this line is the gate.
RUN python -c "from main import app; print('Import validation: OK')"

# ── Security: run as a non-root user ─────────────────────────────────────────
RUN addgroup --system --gid 1001 langgraph && \
    adduser  --system --uid 1001 --ingroup langgraph langgraph
USER langgraph

# ── Runtime configuration ─────────────────────────────────────────────────────
# All values below are safe defaults. Override at runtime via env vars.
# Never bake real secrets into the image.

# URL of the Next.js app that this service calls back into for agent execution
ENV NEXT_INTERNAL_URL="http://app:3000"
# Port this service listens on — must match http_port in infra/app.tf
ENV LANGGRAPH_PORT="8000"

EXPOSE 8000

# Healthcheck — used by Docker Compose and Kubernetes liveness probes
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Use exec so uvicorn receives SIGTERM directly (no sh wrapper → clean shutdown).
# LANGGRAPH_PORT defaults to 8000 above; DigitalOcean App Platform also injects
# it explicitly via the Terraform env block in infra/app.tf.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port \"${LANGGRAPH_PORT:-8000}\" --no-access-log"]
