/**
 * Google OAuth 授权码流辅助（Phase 2，机制参考 v2）。
 *
 * 流程：前端调 POST /auth/google → 得到 authorize_url → 跳转 Google →
 * Google 回调（携带 code+state）→ 前端 POST /auth/google/callback 换会话。
 * 未配置 GOOGLE_CLIENT_ID/SECRET 时，/auth/google 返回 OAUTH_NOT_CONFIGURED
 * （本地验证降级路径，等用户后续提供生产凭据）。
 */

import { config } from './config.js';

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// 标准 OIDC userinfo（返回 sub+email）。⚠️ 不能用 oauth2/v2/userinfo：
// 那个端点返回的标识字段是 `id` 而非 `sub`，会让下面的
// `!data.sub` 校验永远失败（"google userinfo missing identity"）。
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string | null;
  email_verified?: boolean;
}

export function googleIsConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function createAuthorizeUrl(state: string): string {
  const { clientId } = config.google;
  if (!clientId) throw new Error('google client id not configured');
  // 回调必须指向前端页面（/login）：Google 以浏览器 GET 重定向回跳，
  // 前端从 URL 读 code+state 后 POST /api/auth/google/callback 换会话。
  // 指向 api 的 POST 路由会 404（Google 回调是 GET）。
  // ⚠️ 此值必须与 Google Console 的重定向 URI 白名单完全一致。
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${config.siteUrl}/login`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{ access_token: string }> {
  const { clientId, clientSecret } = config.google;
  if (!clientId || !clientSecret) throw new Error('google oauth not configured');
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      // token 交换的 redirect_uri 必须与授权请求完全一致（Google 校验）
      redirect_uri: `${config.siteUrl}/login`,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    throw new Error(`google token exchange failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('google token exchange missing access_token');
  return { access_token: data.access_token };
}

export async function googleUserInfo(accessToken: string): Promise<GoogleIdentity> {
  const resp = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`google userinfo failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as GoogleIdentity;
  if (!data.sub || !data.email) throw new Error('google userinfo missing identity');
  return data;
}
