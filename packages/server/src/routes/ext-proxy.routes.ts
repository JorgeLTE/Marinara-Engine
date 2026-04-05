// ──────────────────────────────────────────────
// Routes: Extension Proxy
// Generic HTTP proxy for client-side extensions
// to make server-side requests (bypasses CORS)
// ──────────────────────────────────────────────
import type { FastifyInstance } from "fastify";

/** URL patterns that are NOT allowed through the proxy (security) */
const BLOCKED_PATTERNS = [
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)/i,
  /^https?:\/\/10\.\d+\.\d+\.\d+/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
  /^https?:\/\/192\.168\.\d+\.\d+/,
  /^file:/i,
];

function isBlockedUrl(url: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(url));
}

export async function extProxyRoutes(app: FastifyInstance) {
  /**
   * POST /api/ext/proxy
   * Body: { url, method?, headers?, body?, timeout? }
   * Returns: { status, headers, body, ok }
   *
   * Extensions use this to make server-side HTTP requests,
   * bypassing browser CORS restrictions.
   */
  app.post("/proxy", async (req, reply) => {
    const {
      url,
      method = "GET",
      headers = {},
      body,
      timeout = 30000,
      responseType = "json",
    } = req.body as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
      timeout?: number;
      responseType?: "json" | "text" | "binary";
    };

    if (!url || typeof url !== "string") {
      return reply.status(400).send({ error: "url is required" });
    }

    if (isBlockedUrl(url)) {
      return reply.status(403).send({ error: "Proxy access to local/private addresses is blocked" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeout, 60000));

    try {
      const fetchOpts: RequestInit = {
        method: method.toUpperCase(),
        headers: headers as Record<string, string>,
        signal: controller.signal,
      };

      // Attach body for non-GET requests
      if (body !== undefined && method.toUpperCase() !== "GET") {
        if (typeof body === "string") {
          fetchOpts.body = body;
        } else {
          fetchOpts.body = JSON.stringify(body);
          // Set content-type if not already set
          const h = fetchOpts.headers as Record<string, string>;
          if (!Object.keys(h).some((k) => k.toLowerCase() === "content-type")) {
            h["Content-Type"] = "application/json";
          }
        }
      }

      const res = await fetch(url, fetchOpts);

      // Collect response headers
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      if (responseType === "binary") {
        const buf = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") || "application/octet-stream";
        return reply
          .status(res.status)
          .header("Content-Type", contentType)
          .header("X-Proxy-Status", String(res.status))
          .send(buf);
      }

      if (responseType === "text") {
        const text = await res.text();
        return {
          ok: res.ok,
          status: res.status,
          headers: responseHeaders,
          body: text,
        };
      }

      // Default: try JSON, fall back to text
      const text = await res.text();
      let jsonBody: unknown;
      try {
        jsonBody = JSON.parse(text);
      } catch {
        jsonBody = text;
      }

      return {
        ok: res.ok,
        status: res.status,
        headers: responseHeaders,
        body: jsonBody,
      };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return reply.status(504).send({ error: "Proxy request timed out" });
      }
      return reply.status(502).send({ error: `Proxy error: ${(err as Error).message}` });
    } finally {
      clearTimeout(timer);
    }
  });

  /**
   * POST /api/ext/proxy/binary
   * Same as /proxy but always returns raw binary response.
   * Useful for proxying images/avatars.
   */
  app.post("/proxy/binary", async (req, reply) => {
    const {
      url,
      method = "GET",
      headers = {},
      timeout = 15000,
    } = req.body as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      timeout?: number;
    };

    if (!url || typeof url !== "string") {
      return reply.status(400).send({ error: "url is required" });
    }

    if (isBlockedUrl(url)) {
      return reply.status(403).send({ error: "Proxy access to local/private addresses is blocked" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeout, 60000));

    try {
      const res = await fetch(url, {
        method: method.toUpperCase(),
        headers: headers as Record<string, string>,
        signal: controller.signal,
      });

      if (!res.ok) {
        return reply.status(res.status).send({ error: `Upstream ${res.status}` });
      }

      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "application/octet-stream";

      return reply
        .header("Content-Type", contentType)
        .header("Cache-Control", "public, max-age=86400")
        .send(buf);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return reply.status(504).send({ error: "Request timed out" });
      }
      return reply.status(502).send({ error: (err as Error).message });
    } finally {
      clearTimeout(timer);
    }
  });
}
