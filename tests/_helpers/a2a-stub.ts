import http from 'http';

type Stub = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

// Tiny in-test A2A stub HTTP server.
// Routes:
//  POST /agents/:endpoint/skills/:skill -> { outputs: { ok: true, skill, input }, artifacts: [] }
export async function startA2AStub(): Promise<Stub> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const method = req.method || 'GET';

      // Expect POST /agents/<endpoint>/skills/<skill>
      const match = url.pathname.match(/^\/agents\/([^/]+)\/skills\/([^/]+)$/);
      if (method === 'POST' && match) {
        const [, endpoint, skill] = match;

        // Read body (JSON)
        let body = '';
        for await (const chunk of req) body += chunk;
        let parsed: any = {};
        try { parsed = body ? JSON.parse(body) : {}; } catch {}

        const response = {
          outputs: { ok: true, skill, endpoint, input: parsed },
          artifacts: []
        };

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(response));
        return;
      }

      // Fallback 404
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'stub_error', message: err?.message }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Failed to bind stub server');

  return {
    url: `http://127.0.0.1:${addr.port}`,
    port: addr.port,
    close: () => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
  };
}

