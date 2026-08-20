/**
 * Centralized environment configuration. All env reads go through here so the
 * rest of the app is testable and typos surface in one place.
 */

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  sessionSecret: string | null;
  sessionCookie: string;
  sessionTtlSeconds: number;
  mockProviders: boolean;
  encKey: string | null;
  // postgres
  pg: { host: string; port: number; database: string; user: string; password: string | undefined };
  // redis
  redis: { host: string; port: number; password: string | undefined };
  // minio
  minio: { endpoint: string; port: number; useSSL: boolean; accessKey: string; secretKey: string; bucket: string };
  // google oauth
  google: { clientId: string | null; clientSecret: string | null };
  // smtp
  smtp: {
    host: string | null;
    port: number;
    secure: boolean;
    user: string | null;
    pass: string | null;
    from: string | null;
  };
  // creem billing
  creem: { apiKey: string | null; webhookSecret: string | null };
  siteUrl: string;
  // wingray provider base url (default managed provider)
  wingrayBaseUrl: string;
}

function num(v: string | undefined, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

function str(v: string | undefined, dflt = ''): string {
  return v !== undefined && v.trim() !== '' ? v.trim() : dflt;
}

export function loadConfig(): Config {
  return {
    env: (process.env.NODE_ENV as Config['env']) || 'development',
    port: num(process.env.PORT, 4000),
    sessionSecret: process.env.SESSION_SECRET || null,
    sessionCookie: 'avs_session',
    sessionTtlSeconds: 30 * 24 * 3600,
    mockProviders: (process.env.MOCK_PROVIDERS || 'true').toLowerCase() === 'true',
    encKey: process.env.ENC_KEY || null,
    pg: {
      host: process.env.PGHOST || 'localhost',
      port: num(process.env.PGPORT, 5432),
      database: process.env.PGDATABASE || 'ai_video_studio',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || undefined,
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: num(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    minio: {
      endpoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: num(process.env.MINIO_PORT, 9000),
      useSSL: (process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
      bucket: 'avs-assets',
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || null,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
    },
    smtp: {
      host: process.env.SMTP_HOST || null,
      port: num(process.env.SMTP_PORT, 587),
      secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      user: process.env.SMTP_USER || null,
      pass: process.env.SMTP_PASS || null,
      from: process.env.SMTP_FROM || null,
    },
    creem: {
      apiKey: process.env.CREEM_API_KEY || null,
      webhookSecret: process.env.CREEM_WEBHOOK_SECRET || null,
    },
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://aivideostudio.app',
    wingrayBaseUrl: process.env.WINGRAY_BASE_URL || 'https://maas.wing-ray.cn',
  };
}

export const config = loadConfig();
