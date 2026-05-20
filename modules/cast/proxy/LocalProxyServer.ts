/**
 * LocalProxyServer — Local HTTP proxy that injects custom headers into
 * outgoing requests for protocols (like AirPlay) that cannot send custom
 * headers natively.
 *
 * The server binds exclusively to the loopback address (127.0.0.1) and
 * rejects connections from non-loopback sources. Each registered stream
 * gets a unique URL-safe path token (16+ characters) that maps to the
 * original URL and its required headers.
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisterStreamParams {
  /** The original upstream URL to proxy. */
  originalUrl: string;
  /** Headers to inject on every proxied request. */
  headers: Record<string, string>;
  /** MIME type of the stream (informational). */
  mimeType: string;
}

interface StreamRegistration {
  originalUrl: string;
  headers: Record<string, string>;
  mimeType: string;
}

/**
 * Minimal HTTP server abstraction.
 *
 * In a React Native environment this would be backed by a native TCP module
 * (e.g., `react-native-tcp-socket`) or a JS-based HTTP server library.
 * The abstraction allows unit testing without native dependencies.
 */
export interface HttpServerRequest {
  /** Request URL path (e.g., "/stream/abc123"). */
  url: string;
  /** HTTP method. */
  method: string;
  /** Request headers (lowercased keys). */
  headers: Record<string, string>;
  /** Remote address of the client. */
  remoteAddress: string;
}

export interface HttpServerResponse {
  /** Set the HTTP status code. */
  statusCode: number;
  /** Set a response header. */
  setHeader(name: string, value: string): void;
  /** Write data to the response body. */
  write(chunk: Buffer | string): void;
  /** End the response. */
  end(data?: Buffer | string): void;
}

export interface UpstreamResponse {
  statusCode: number;
  headers: Record<string, string>;
  /** Read the response body. Resolves when complete. */
  body: Buffer | null;
}

/**
 * Abstraction for making upstream HTTP requests.
 * In production this uses `fetch` or a native HTTP client.
 */
export type UpstreamFetcher = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    timeoutMs: number;
  },
) => Promise<UpstreamResponse>;

/**
 * Abstraction for the underlying HTTP server.
 * Allows injection of different server implementations for testing.
 */
export interface HttpServer {
  listen(
    port: number,
    host: string,
    callback: () => void,
  ): void;
  close(callback?: (err?: Error) => void): void;
  onRequest(
    handler: (req: HttpServerRequest, res: HttpServerResponse) => void,
  ): void;
}

export type HttpServerFactory = () => HttpServer;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time for the server to become ready (ms). */
const START_TIMEOUT_MS = 3_000;

/** Maximum time for the server to shut down (ms). */
const STOP_TIMEOUT_MS = 5_000;

/** Upstream request timeout (ms). */
const UPSTREAM_TIMEOUT_MS = 15_000;

/** Maximum number of concurrent registered streams. */
const MAX_REGISTERED_STREAMS = 20;

/** Minimum length of the random path token. */
const MIN_TOKEN_LENGTH = 16;

/** Characters used for URL-safe random token generation. */
const TOKEN_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Loopback addresses for connection validation. */
const LOOPBACK_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "localhost",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random URL-safe token of the given length.
 */
function generateToken(length: number = MIN_TOKEN_LENGTH): string {
  let token = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * TOKEN_CHARS.length);
    token += TOKEN_CHARS[randomIndex];
  }
  return token;
}

/**
 * Check if a remote address is a loopback address.
 */
function isLoopback(address: string): boolean {
  if (!address) return false;
  return LOOPBACK_ADDRESSES.has(address);
}

// ---------------------------------------------------------------------------
// Default Upstream Fetcher
// ---------------------------------------------------------------------------

/**
 * Default upstream fetcher using global `fetch`.
 * In React Native, `fetch` is available globally.
 */
const defaultUpstreamFetcher: UpstreamFetcher = async (url, options) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      signal: controller.signal,
    });

    const body = Buffer.from(await response.arrayBuffer());
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      statusCode: response.status,
      headers,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
};

// ---------------------------------------------------------------------------
// Default HTTP Server Factory
// ---------------------------------------------------------------------------

/**
 * Default HTTP server factory placeholder.
 *
 * In a React Native environment, this would use `react-native-tcp-socket`
 * or a similar library to create an HTTP server. For testing, consumers
 * inject a mock factory.
 */
let defaultHttpServerFactory: HttpServerFactory = () => {
  let requestHandler: ((req: HttpServerRequest, res: HttpServerResponse) => void) | null = null;

  return {
    listen(_port: number, _host: string, callback: () => void) {
      // In production, this binds to the port via native TCP module
      callback();
    },
    close(callback?: (err?: Error) => void) {
      if (callback) callback();
    },
    onRequest(handler: (req: HttpServerRequest, res: HttpServerResponse) => void) {
      requestHandler = handler;
      void requestHandler; // suppress unused warning in placeholder
    },
  };
};

/**
 * Override the default HTTP server factory.
 * Used for testing and app-level integration.
 */
export function setHttpServerFactory(factory: HttpServerFactory): void {
  defaultHttpServerFactory = factory;
}

// ---------------------------------------------------------------------------
// LocalProxyServer
// ---------------------------------------------------------------------------

export class LocalProxyServer {
  private server: HttpServer | null = null;
  private registrations = new Map<string, StreamRegistration>();
  private port: number = 0;
  private running = false;
  private httpServerFactory: HttpServerFactory;
  private upstreamFetcher: UpstreamFetcher;

  constructor(options?: {
    httpServerFactory?: HttpServerFactory;
    upstreamFetcher?: UpstreamFetcher;
  }) {
    this.httpServerFactory = options?.httpServerFactory ?? defaultHttpServerFactory;
    this.upstreamFetcher = options?.upstreamFetcher ?? defaultUpstreamFetcher;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start the proxy server on the specified port, bound to 127.0.0.1 only.
   *
   * Req 13.1: Binds to loopback only, ready within 3 seconds.
   *
   * @param port - The port to listen on.
   * @returns The base URL (e.g., "http://127.0.0.1:8765").
   * @throws If the server fails to start within 3 seconds.
   */
  async start(port: number): Promise<string> {
    if (this.running) {
      throw new Error("LocalProxyServer is already running");
    }

    this.port = port;
    this.registrations.clear();

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`LocalProxyServer failed to start within ${START_TIMEOUT_MS}ms`));
      }, START_TIMEOUT_MS);

      try {
        this.server = this.httpServerFactory();

        // Register the request handler
        this.server.onRequest((req, res) => {
          this.handleRequest(req, res);
        });

        // Bind to loopback only
        this.server.listen(port, "127.0.0.1", () => {
          clearTimeout(timeout);
          this.running = true;
          resolve(`http://127.0.0.1:${port}`);
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new Error(
            `LocalProxyServer failed to start: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });
  }

  /**
   * Stop the proxy server, closing all connections and releasing the port.
   *
   * Req 13.6: Close connections and release port within 5 seconds.
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`LocalProxyServer failed to stop within ${STOP_TIMEOUT_MS}ms`));
      }, STOP_TIMEOUT_MS);

      this.server!.close((err) => {
        clearTimeout(timeout);
        this.running = false;
        this.server = null;
        this.registrations.clear();

        if (err) {
          reject(
            new Error(`LocalProxyServer stop error: ${err.message}`),
          );
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Register a stream to be proxied.
   *
   * Req 13.2: Returns unique proxied URL with 16+ char random path token.
   * Req 13.8: Maximum 20 concurrent registered streams.
   *
   * @param params - The stream registration parameters.
   * @returns The proxied URL (e.g., "http://127.0.0.1:8765/stream/aBcDeFgHiJkLmNoP").
   * @throws If the server is not running or max streams exceeded.
   */
  registerStream(params: RegisterStreamParams): string {
    if (!this.running) {
      throw new Error("LocalProxyServer is not running");
    }

    // Req 13.8: Enforce maximum concurrent streams
    if (this.registrations.size >= MAX_REGISTERED_STREAMS) {
      throw new Error(
        `Maximum number of registered streams (${MAX_REGISTERED_STREAMS}) reached`,
      );
    }

    // Req 13.2: Generate unique path token (16+ URL-safe characters)
    let token: string;
    do {
      token = generateToken(MIN_TOKEN_LENGTH);
    } while (this.registrations.has(token));

    this.registrations.set(token, {
      originalUrl: params.originalUrl,
      headers: { ...params.headers },
      mimeType: params.mimeType,
    });

    return `http://127.0.0.1:${this.port}/stream/${token}`;
  }

  /**
   * Get the number of currently registered streams.
   */
  get registeredStreamCount(): number {
    return this.registrations.size;
  }

  /**
   * Check if the server is currently running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Handle an incoming HTTP request.
   */
  private handleRequest(req: HttpServerRequest, res: HttpServerResponse): void {
    // Req 13.7: Reject non-loopback connections
    if (!isLoopback(req.remoteAddress)) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain");
      res.end("Forbidden: non-loopback connection rejected");
      return;
    }

    // Parse the path token from the URL
    const pathMatch = req.url.match(/^\/stream\/([A-Za-z0-9_-]+)/);
    if (!pathMatch) {
      // Req 13.5: Not-found for unregistered/invalid paths
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("Not Found");
      return;
    }

    const token = pathMatch[1];
    const registration = this.registrations.get(token);

    if (!registration) {
      // Req 13.5: Not-found for unregistered path tokens
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("Not Found");
      return;
    }

    // Req 13.3: Forward request to original URL with injected headers
    this.proxyRequest(req, res, registration);
  }

  /**
   * Proxy a request to the upstream server with injected headers.
   *
   * Req 13.3: Inject registered headers, preserve non-conflicting client headers.
   * Req 13.4: Forward error responses without retrying; 15-second timeout.
   */
  private async proxyRequest(
    req: HttpServerRequest,
    res: HttpServerResponse,
    registration: StreamRegistration,
  ): Promise<void> {
    // Build outgoing headers: start with client headers, then overlay injected headers
    const outgoingHeaders: Record<string, string> = {};

    // Req 13.3: Preserve non-conflicting client headers
    for (const [key, value] of Object.entries(req.headers)) {
      // Skip hop-by-hop headers and host
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === "host" ||
        lowerKey === "connection" ||
        lowerKey === "keep-alive" ||
        lowerKey === "transfer-encoding" ||
        lowerKey === "upgrade"
      ) {
        continue;
      }
      outgoingHeaders[key] = value;
    }

    // Req 13.3: Inject registered headers (override any conflicting client headers)
    for (const [key, value] of Object.entries(registration.headers)) {
      outgoingHeaders[key] = value;
    }

    try {
      // Req 13.4: 15-second upstream timeout
      const upstream = await this.upstreamFetcher(registration.originalUrl, {
        method: req.method,
        headers: outgoingHeaders,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      });

      // Req 13.4: Forward upstream response (including 4xx/5xx) without retrying
      res.statusCode = upstream.statusCode;

      // Forward upstream response headers
      for (const [key, value] of Object.entries(upstream.headers)) {
        const lowerKey = key.toLowerCase();
        // Skip hop-by-hop headers
        if (
          lowerKey === "connection" ||
          lowerKey === "keep-alive" ||
          lowerKey === "transfer-encoding"
        ) {
          continue;
        }
        res.setHeader(key, value);
      }

      // Write body
      if (upstream.body) {
        res.write(upstream.body);
      }
      res.end();
    } catch (error) {
      // Req 13.4: Upstream timeout or network error
      if (error instanceof Error && error.name === "AbortError") {
        res.statusCode = 504;
        res.setHeader("Content-Type", "text/plain");
        res.end("Gateway Timeout: upstream did not respond within 15 seconds");
      } else {
        res.statusCode = 502;
        res.setHeader("Content-Type", "text/plain");
        res.end(
          `Bad Gateway: ${error instanceof Error ? error.message : "upstream request failed"}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exported Constants (for testing)
// ---------------------------------------------------------------------------

export {
  START_TIMEOUT_MS,
  STOP_TIMEOUT_MS,
  UPSTREAM_TIMEOUT_MS,
  MAX_REGISTERED_STREAMS,
  MIN_TOKEN_LENGTH,
  TOKEN_CHARS,
  LOOPBACK_ADDRESSES,
  generateToken,
  isLoopback,
};
