/**
 * Unit tests for LocalProxyServer.
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  LocalProxyServer,
  generateToken,
  isLoopback,
  MIN_TOKEN_LENGTH,
  MAX_REGISTERED_STREAMS,
  LOOPBACK_ADDRESSES,
  type HttpServer,
  type HttpServerRequest,
  type HttpServerResponse,
  type UpstreamFetcher,
  type UpstreamResponse,
} from "./LocalProxyServer";

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

type RequestHandler = (req: HttpServerRequest, res: HttpServerResponse) => void;

function createMockHttpServer(): HttpServer & { triggerRequest: (req: HttpServerRequest) => MockResponse } {
  let handler: RequestHandler | null = null;

  const server = {
    listen(_port: number, _host: string, callback: () => void) {
      callback();
    },
    close(callback?: (err?: Error) => void) {
      if (callback) callback();
    },
    onRequest(h: RequestHandler) {
      handler = h;
    },
    triggerRequest(req: HttpServerRequest): MockResponse {
      const res = createMockResponse();
      if (handler) {
        handler(req, res);
      }
      return res;
    },
  };

  return server;
}

interface MockResponse extends HttpServerResponse {
  getStatusCode(): number;
  getHeaders(): Record<string, string>;
  getBody(): string;
}

function createMockResponse(): MockResponse {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";

  return {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    write(chunk: Buffer | string) {
      body += typeof chunk === "string" ? chunk : chunk.toString();
    },
    end(data?: Buffer | string) {
      if (data) {
        body += typeof data === "string" ? data : data.toString();
      }
    },
    getStatusCode() {
      return statusCode;
    },
    getHeaders() {
      return headers;
    },
    getBody() {
      return body;
    },
  };
}

function createMockUpstreamFetcher(response?: Partial<UpstreamResponse>): UpstreamFetcher {
  return async (_url, _options) => ({
    statusCode: response?.statusCode ?? 200,
    headers: response?.headers ?? { "content-type": "application/x-mpegURL" },
    body: response?.body ?? Buffer.from("mock-stream-data"),
  });
}

function createFailingUpstreamFetcher(error: Error): UpstreamFetcher {
  return async () => {
    throw error;
  };
}

function makeLoopbackRequest(url: string, overrides?: Partial<HttpServerRequest>): HttpServerRequest {
  return {
    url,
    method: "GET",
    headers: {},
    remoteAddress: "127.0.0.1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LocalProxyServer", () => {
  let server: LocalProxyServer;
  let mockHttpServer: ReturnType<typeof createMockHttpServer>;
  let mockFetcher: UpstreamFetcher;

  beforeEach(() => {
    mockHttpServer = createMockHttpServer();
    mockFetcher = createMockUpstreamFetcher();
    server = new LocalProxyServer({
      httpServerFactory: () => mockHttpServer,
      upstreamFetcher: mockFetcher,
    });
  });

  afterEach(async () => {
    if (server.isRunning) {
      await server.stop();
    }
  });

  // -------------------------------------------------------------------------
  // start()
  // -------------------------------------------------------------------------

  describe("start()", () => {
    it("starts the server and returns the base URL (Req 13.1)", async () => {
      const baseUrl = await server.start(8765);
      expect(baseUrl).toBe("http://127.0.0.1:8765");
      expect(server.isRunning).toBe(true);
    });

    it("throws if already running", async () => {
      await server.start(8765);
      await expect(server.start(8766)).rejects.toThrow("already running");
    });

    it("rejects if server fails to start within timeout", async () => {
      const hangingServer = createMockHttpServer();
      // Override listen to never call the callback
      hangingServer.listen = () => {};

      const hangingProxy = new LocalProxyServer({
        httpServerFactory: () => hangingServer,
        upstreamFetcher: mockFetcher,
      });

      await expect(hangingProxy.start(8765)).rejects.toThrow("failed to start");
    }, 5000);
  });

  // -------------------------------------------------------------------------
  // stop()
  // -------------------------------------------------------------------------

  describe("stop()", () => {
    it("stops the server and releases resources (Req 13.6)", async () => {
      await server.start(8765);
      await server.stop();

      expect(server.isRunning).toBe(false);
      expect(server.registeredStreamCount).toBe(0);
    });

    it("is a no-op if server is not running", async () => {
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // registerStream()
  // -------------------------------------------------------------------------

  describe("registerStream()", () => {
    it("returns a unique proxied URL with 16+ char token (Req 13.2)", async () => {
      await server.start(8765);

      const url = server.registerStream({
        originalUrl: "https://example.com/stream.m3u8",
        headers: { Referer: "https://example.com" },
        mimeType: "application/x-mpegURL",
      });

      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:8765\/stream\/[A-Za-z0-9_-]{16,}$/);
    });

    it("generates unique URLs for each registration", async () => {
      await server.start(8765);

      const urls = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const url = server.registerStream({
          originalUrl: `https://example.com/stream${i}.m3u8`,
          headers: {},
          mimeType: "application/x-mpegURL",
        });
        urls.add(url);
      }

      expect(urls.size).toBe(10);
    });

    it("throws if server is not running", () => {
      expect(() =>
        server.registerStream({
          originalUrl: "https://example.com/stream.m3u8",
          headers: {},
          mimeType: "application/x-mpegURL",
        }),
      ).toThrow("not running");
    });

    it("throws when max streams (20) exceeded (Req 13.8)", async () => {
      await server.start(8765);

      // Register 20 streams
      for (let i = 0; i < MAX_REGISTERED_STREAMS; i++) {
        server.registerStream({
          originalUrl: `https://example.com/stream${i}.m3u8`,
          headers: {},
          mimeType: "application/x-mpegURL",
        });
      }

      // 21st should throw
      expect(() =>
        server.registerStream({
          originalUrl: "https://example.com/overflow.m3u8",
          headers: {},
          mimeType: "application/x-mpegURL",
        }),
      ).toThrow("Maximum");
    });
  });

  // -------------------------------------------------------------------------
  // Request handling
  // -------------------------------------------------------------------------

  describe("request handling", () => {
    it("rejects non-loopback connections with 403 (Req 13.7)", async () => {
      await server.start(8765);

      server.registerStream({
        originalUrl: "https://example.com/stream.m3u8",
        headers: {},
        mimeType: "application/x-mpegURL",
      });

      const res = mockHttpServer.triggerRequest({
        url: "/stream/sometoken",
        method: "GET",
        headers: {},
        remoteAddress: "192.168.1.50",
      });

      expect(res.getStatusCode()).toBe(403);
      expect(res.getBody()).toContain("Forbidden");
    });

    it("returns 404 for unregistered path tokens (Req 13.5)", async () => {
      await server.start(8765);

      const res = mockHttpServer.triggerRequest(
        makeLoopbackRequest("/stream/nonexistenttoken123"),
      );

      expect(res.getStatusCode()).toBe(404);
      expect(res.getBody()).toContain("Not Found");
    });

    it("returns 404 for invalid URL paths", async () => {
      await server.start(8765);

      const res = mockHttpServer.triggerRequest(
        makeLoopbackRequest("/invalid/path"),
      );

      expect(res.getStatusCode()).toBe(404);
    });

    it("forwards requests to original URL with injected headers (Req 13.3)", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};

      const capturingFetcher: UpstreamFetcher = async (url, options) => {
        capturedUrl = url;
        capturedHeaders = options.headers;
        return {
          statusCode: 200,
          headers: { "content-type": "application/x-mpegURL" },
          body: Buffer.from("stream-data"),
        };
      };

      const proxyServer = new LocalProxyServer({
        httpServerFactory: () => mockHttpServer,
        upstreamFetcher: capturingFetcher,
      });

      await proxyServer.start(8765);

      const proxiedUrl = proxyServer.registerStream({
        originalUrl: "https://cdn.example.com/video.m3u8",
        headers: { Referer: "https://example.com", "X-Custom": "value" },
        mimeType: "application/x-mpegURL",
      });

      // Extract token from URL
      const token = proxiedUrl.split("/stream/")[1];

      // Simulate a request with client headers
      mockHttpServer.triggerRequest({
        url: `/stream/${token}`,
        method: "GET",
        headers: { "accept": "application/x-mpegURL", "user-agent": "AirPlay/1.0" },
        remoteAddress: "127.0.0.1",
      });

      // Wait for async proxy to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(capturedUrl).toBe("https://cdn.example.com/video.m3u8");
      // Injected headers should be present
      expect(capturedHeaders["Referer"]).toBe("https://example.com");
      expect(capturedHeaders["X-Custom"]).toBe("value");
      // Non-conflicting client headers should be preserved
      expect(capturedHeaders["accept"]).toBe("application/x-mpegURL");
      expect(capturedHeaders["user-agent"]).toBe("AirPlay/1.0");
    });

    it("injected headers override conflicting client headers (Req 13.3)", async () => {
      let capturedHeaders: Record<string, string> = {};

      const capturingFetcher: UpstreamFetcher = async (_url, options) => {
        capturedHeaders = options.headers;
        return {
          statusCode: 200,
          headers: {},
          body: Buffer.from("data"),
        };
      };

      const proxyServer = new LocalProxyServer({
        httpServerFactory: () => mockHttpServer,
        upstreamFetcher: capturingFetcher,
      });

      await proxyServer.start(8765);

      const proxiedUrl = proxyServer.registerStream({
        originalUrl: "https://example.com/stream.m3u8",
        headers: { Referer: "https://injected.com" },
        mimeType: "application/x-mpegURL",
      });

      const token = proxiedUrl.split("/stream/")[1];

      mockHttpServer.triggerRequest({
        url: `/stream/${token}`,
        method: "GET",
        headers: { Referer: "https://client-original.com" },
        remoteAddress: "127.0.0.1",
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Injected header wins over client header
      expect(capturedHeaders["Referer"]).toBe("https://injected.com");
    });

    it("forwards upstream 4xx/5xx errors without retrying (Req 13.4)", async () => {
      const errorFetcher = createMockUpstreamFetcher({
        statusCode: 403,
        headers: { "content-type": "text/plain" },
        body: Buffer.from("Forbidden by upstream"),
      });

      const proxyServer = new LocalProxyServer({
        httpServerFactory: () => mockHttpServer,
        upstreamFetcher: errorFetcher,
      });

      await proxyServer.start(8765);

      const proxiedUrl = proxyServer.registerStream({
        originalUrl: "https://example.com/protected.m3u8",
        headers: {},
        mimeType: "application/x-mpegURL",
      });

      const token = proxiedUrl.split("/stream/")[1];

      const res = mockHttpServer.triggerRequest(
        makeLoopbackRequest(`/stream/${token}`),
      );

      // Wait for async proxy
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(res.getStatusCode()).toBe(403);
    });

    it("returns 502 on upstream network error (Req 13.4)", async () => {
      const failFetcher = createFailingUpstreamFetcher(new Error("ECONNREFUSED"));

      const proxyServer = new LocalProxyServer({
        httpServerFactory: () => mockHttpServer,
        upstreamFetcher: failFetcher,
      });

      await proxyServer.start(8765);

      const proxiedUrl = proxyServer.registerStream({
        originalUrl: "https://example.com/stream.m3u8",
        headers: {},
        mimeType: "application/x-mpegURL",
      });

      const token = proxiedUrl.split("/stream/")[1];

      const res = mockHttpServer.triggerRequest(
        makeLoopbackRequest(`/stream/${token}`),
      );

      // Wait for async proxy
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(res.getStatusCode()).toBe(502);
      expect(res.getBody()).toContain("Bad Gateway");
    });

    it("returns 504 on upstream timeout (Req 13.4)", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      const timeoutFetcher = createFailingUpstreamFetcher(abortError);

      const proxyServer = new LocalProxyServer({
        httpServerFactory: () => mockHttpServer,
        upstreamFetcher: timeoutFetcher,
      });

      await proxyServer.start(8765);

      const proxiedUrl = proxyServer.registerStream({
        originalUrl: "https://example.com/slow.m3u8",
        headers: {},
        mimeType: "application/x-mpegURL",
      });

      const token = proxiedUrl.split("/stream/")[1];

      const res = mockHttpServer.triggerRequest(
        makeLoopbackRequest(`/stream/${token}`),
      );

      // Wait for async proxy
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(res.getStatusCode()).toBe(504);
      expect(res.getBody()).toContain("Gateway Timeout");
    });

    it("strips hop-by-hop headers from client requests", async () => {
      let capturedHeaders: Record<string, string> = {};

      const capturingFetcher: UpstreamFetcher = async (_url, options) => {
        capturedHeaders = options.headers;
        return {
          statusCode: 200,
          headers: {},
          body: Buffer.from("data"),
        };
      };

      const proxyServer = new LocalProxyServer({
        httpServerFactory: () => mockHttpServer,
        upstreamFetcher: capturingFetcher,
      });

      await proxyServer.start(8765);

      const proxiedUrl = proxyServer.registerStream({
        originalUrl: "https://example.com/stream.m3u8",
        headers: {},
        mimeType: "application/x-mpegURL",
      });

      const token = proxiedUrl.split("/stream/")[1];

      mockHttpServer.triggerRequest({
        url: `/stream/${token}`,
        method: "GET",
        headers: {
          host: "127.0.0.1:8765",
          connection: "keep-alive",
          "keep-alive": "timeout=5",
          "transfer-encoding": "chunked",
          "accept": "application/x-mpegURL",
        },
        remoteAddress: "127.0.0.1",
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Hop-by-hop headers should be stripped
      expect(capturedHeaders["host"]).toBeUndefined();
      expect(capturedHeaders["connection"]).toBeUndefined();
      expect(capturedHeaders["keep-alive"]).toBeUndefined();
      expect(capturedHeaders["transfer-encoding"]).toBeUndefined();
      // Regular headers should pass through
      expect(capturedHeaders["accept"]).toBe("application/x-mpegURL");
    });
  });
});

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

describe("generateToken", () => {
  it("generates tokens of at least MIN_TOKEN_LENGTH characters", () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(MIN_TOKEN_LENGTH);
  });

  it("generates tokens of specified length", () => {
    const token = generateToken(32);
    expect(token.length).toBe(32);
  });

  it("generates URL-safe characters only", () => {
    for (let i = 0; i < 100; i++) {
      const token = generateToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("isLoopback", () => {
  it("recognizes loopback addresses", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("localhost")).toBe(true);
  });

  it("rejects non-loopback addresses", () => {
    expect(isLoopback("192.168.1.1")).toBe(false);
    expect(isLoopback("10.0.0.1")).toBe(false);
    expect(isLoopback("0.0.0.0")).toBe(false);
    expect(isLoopback("")).toBe(false);
  });
});
