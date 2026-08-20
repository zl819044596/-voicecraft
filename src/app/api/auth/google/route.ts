import { NextResponse } from "next/server";
import {
  googleConfigured,
  newOAuthState,
  setOAuthState,
  siteUrl,
} from "@/lib/tool-session";

export async function POST() {
  if (!googleConfigured()) {
    return NextResponse.json(
      { error: { code: "OAUTH_NOT_CONFIGURED", message: "Google OAuth 未配置（GOOGLE_CLIENT_ID / SECRET）" } },
      { status: 500 },
    );
  }

  const state = newOAuthState();
  await setOAuthState(state);

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${siteUrl()}/login`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });

  return NextResponse.json({
    authorize_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    state,
  });
}
