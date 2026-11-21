import { Container, getRandom } from "@cloudflare/containers";

// Vars come from wrangler.jsonc and are typed by `wrangler types` (Env). Secrets are set with
// `wrangler secret put --env <env>` and are not in the config, so they are declared here.
interface Secrets {
  DATABASE_CONNECTION_STRING: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}
type AppEnv = Env & Secrets;

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
