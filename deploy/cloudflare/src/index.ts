import { Container, getRandom } from "@cloudflare/containers";

// Vars come from wrangler.jsonc and are typed by `wrangler types` (Env). Secrets are set with
// `wrangler secret put --env <env>` and are not in the config, so they are declared here.
interface Secrets {
  DATABASE_CONNECTION_STRING: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  /** Shared with the API (SignedVideoUrl.cs): signs the links of the video host. */
  VIDEO_URL_SIGNING_KEY: string;
}
// Declared here too so the code type-checks before `wrangler types` regenerates Env with them.
interface VideoBindings {
  VIDEO_HOST: string;
  VIDEOS: R2Bucket;
}
type AppEnv = Env & Secrets & VideoBindings;

const VIDEO_KEY = /^\/videos\/[0-9a-f]{32}\/(480p|720p|1080p)\.mp4$/;
const encoder = new TextEncoder();

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Same scheme as SignedVideoUrl.cs: base64url(HMAC-SHA256(key, "{path}\n{exp}")). verify() compares in constant time. */
async function hasValidVideoSignature(path: string, exp: string, sig: string, signingKey: string): Promise<boolean> {
  const signature = fromBase64Url(sig);
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(`${path}\n${exp}`));
}

/**
 * The participant's videos, on our own domain (VIDEO_HOST), read from the bucket binding. Only links the API signed
 * after its access checks open, until they expire; the bucket itself stays private.
 */
async function serveVideo(request: Request, url: URL, env: AppEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  const expiresAt = Number(exp);
  if (!VIDEO_KEY.test(url.pathname) || !/^\d+$/.test(exp) || expiresAt * 1000 < Date.now() ||
      !(await hasValidVideoSignature(url.pathname, exp, sig, env.VIDEO_URL_SIGNING_KEY))) {
    return new Response("Link de vídeo inválido ou expirado.", { status: 403 });
  }

  const key = url.pathname.slice(1);
  let object: R2Object | R2ObjectBody | null;
  try {
    object = request.method === "HEAD"
      ? await env.VIDEOS.head(key)
      : await env.VIDEOS.get(key, { range: request.headers });
  } catch {
    return new Response(null, { status: 416 });
  }
  if (!object) return new Response("Vídeo não encontrado.", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  // Each link is personal and short-lived: the browser may keep it, a shared cache may not.
  const maxAge = Math.max(0, Math.floor(expiresAt - Date.now() / 1000));
  headers.set("Cache-Control", `private, max-age=${maxAge}`);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");

  const body = "body" in object ? (object as R2ObjectBody).body : null;
  const range = body ? object.range : undefined;
  if (!body || !range || !request.headers.has("Range")) {
    headers.set("Content-Length", String(object.size));
    return new Response(body, { status: 200, headers });
  }
  const offset = "suffix" in range ? object.size - range.suffix : (range.offset ?? 0);
  const length = "suffix" in range ? range.suffix : (range.length ?? object.size - offset);
  headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
  headers.set("Content-Length", String(length));
  return new Response(body, { status: 206, headers });
}

const ALL_IPV4 = "0.0.0.0/0";
const ALL_IPV6 = "::/0";
const UPLOAD_COMPLETE = /^\/api\/platform\/catalog\/videos\/uploads\/[^/]+\/complete$/;

/** The settings the API reads, as the container environment. worker=true only on the converter. */
function apiEnv(env: AppEnv, options: { worker: boolean }): Record<string, string> {
  return {
    ASPNETCORE_ENVIRONMENT: "Production",
    ASPNETCORE_HTTP_PORTS: "8080",
    ConnectionStrings__SipatOnline: env.DATABASE_CONNECTION_STRING,
    SipatOnline__Tenant__BaseDomain: env.TENANT_BASE_DOMAIN,
    SipatOnline__Tenant__PlatformHost: env.PLATFORM_HOST,
    SipatOnline__Tenant__Id: "00000000-0000-0000-0000-000000000000",
    SipatOnline__VideoStorage__Provider: "R2",
    SipatOnline__VideoStorage__R2__ServiceUrl: env.R2_SERVICE_URL,
    SipatOnline__VideoStorage__R2__AccessKeyId: env.R2_ACCESS_KEY_ID,
    SipatOnline__VideoStorage__R2__SecretAccessKey: env.R2_SECRET_ACCESS_KEY,
    SipatOnline__VideoStorage__R2__Bucket: env.R2_VIDEO_BUCKET,
    SipatOnline__VideoStorage__R2__DirectUpload: "true",
    SipatOnline__VideoStorage__R2__PublicBaseUrl: `https://${env.VIDEO_HOST}`,
    SipatOnline__VideoStorage__R2__UrlSigningKey: env.VIDEO_URL_SIGNING_KEY,
    SipatOnline__VideoConversion__Enabled: "true",
    SipatOnline__VideoConversion__WorkPath: "/tmp/sipat-video-work",
    SipatOnline__VideoConversion__RunInBackground: String(options.worker),
    // The container is reachable only through its Durable Object, so any peer is the Worker.
    SipatOnline__ForwardedHeaders__KnownNetworks__0: ALL_IPV4,
    SipatOnline__ForwardedHeaders__KnownNetworks__1: ALL_IPV6,
  };
}

/** Serves the HTTP API. Never converts videos. */
export class SipatApi extends Container<AppEnv> {
  defaultPort = 8080;
  sleepAfter = "15m";

  constructor(ctx: DurableObjectState<{}>, env: AppEnv) {
    super(ctx, env);
    this.envVars = apiEnv(env, { worker: false });
  }
}

/** The single instance that converts videos. Stays awake while a conversion is running. */
export class SipatConverter extends Container<AppEnv> {
  defaultPort = 8080;
  sleepAfter = "10m";

  constructor(ctx: DurableObjectState<{}>, env: AppEnv) {
    super(ctx, env);
    this.envVars = apiEnv(env, { worker: true });
  }

  override async onActivityExpired(): Promise<void> {
    try {
      const response = await this.containerFetch("http://converter/health/conversion");
      const state = (await response.json()) as { busy?: boolean };
      if (state.busy) {
        await this.renewActivityTimeout();
        return;
      }
    } catch {
      // Unreachable or unexpected answer: nothing proves a conversion is running, let it sleep.
    }
    await this.stop();
  }
}

async function wakeConverter(env: AppEnv): Promise<void> {
  await env.SIPAT_CONVERTER.getByName("converter").fetch("http://converter/health");
}

function forApi(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith("x-forwarded-")) headers.delete(name);
  }
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) headers.set("X-Forwarded-For", clientIp);
  headers.set("X-Forwarded-Proto", "https");
  return new Request(request, { headers });
}

export default {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === env.VIDEO_HOST) {
      return serveVideo(request, url, env);
    }
    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      const instance = await getRandom(env.SIPAT_API, Number(env.API_INSTANCES));
      const response = await instance.fetch(forApi(request));
      if (request.method === "POST" && response.status === 201 && UPLOAD_COMPLETE.test(url.pathname)) {
        ctx.waitUntil(wakeConverter(env));
      }
      return response;
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: AppEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(wakeConverter(env));
  },
} satisfies ExportedHandler<AppEnv>;
