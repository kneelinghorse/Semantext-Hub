# Dockerfile for OSSP-AGI MCP Server
# Mission B9.1: Performance Optimization & Hardening

FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY packages/ ./packages/
COPY seeds/ ./seeds/
COPY templates/ ./templates/
COPY tests/ ./tests/
COPY scripts/ ./scripts/
COPY fixtures/ ./fixtures/
COPY approved/ ./approved/
COPY drafts/ ./drafts/
COPY artifacts/ ./artifacts/
COPY overrides/ ./overrides/
COPY docs/ ./docs/
COPY GOVERNANCE.md ./
COPY jest.config.js ./
COPY mcp-config-example.json ./
COPY README.md ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ossp -u 1001

# Set ownership
RUN chown -R ossp:nodejs /app

# Switch to non-root user
USER ossp

# Expose port (if HTTP server is added in future)
EXPOSE 3000

# Health check — expect registry service /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PROTOCOL_ROOT=/app
ENV NODE_OPTIONS="--max-old-space-size=256"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start MCP server
CMD ["node", "packages/runtime/bin/protocol-mcp-server.js"]

# Labels for metadata
LABEL maintainer="OSSP-AGI Team"
LABEL version="0.1.0"
LABEL description="Protocol Discovery MCP Server"
LABEL mission="B9.1-Performance-Optimization-Hardening"
