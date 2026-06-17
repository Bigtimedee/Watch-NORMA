import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { generateSecret, hashSecret } from "@/lib/oauth";

const ALL_SCOPES = ["campaigns:read", "campaigns:write", "reporting:read", "inventory:read"];

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  return supabase.auth.getUser();
}

export async function GET(request: NextRequest) {
  try {
    const { data: { user } } = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdmin();
    const { data: advertiser } = await admin
      .from("advertisers")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!advertiser) return NextResponse.json({ error: "Advertiser not found" }, { status: 404 });

    const { data: clients } = await admin
      .from("oauth_clients")
      .select("id, client_id, name, scopes, is_active, created_at, last_used_at")
      .eq("advertiser_id", advertiser.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ clients: clients ?? [] });
  } catch (err) {
    console.error('[oauth-clients GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data: { user } } = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as { name?: string; scopes?: string[] };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const requestedScopes = body.scopes ?? ALL_SCOPES;
    const validScopes = requestedScopes.filter((s) => ALL_SCOPES.includes(s));
    if (validScopes.length === 0) {
      return NextResponse.json({ error: "At least one valid scope is required" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data: advertiser } = await admin
      .from("advertisers")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!advertiser) return NextResponse.json({ error: "Advertiser not found" }, { status: 404 });

    const plainSecret = generateSecret();
    const secretHash = hashSecret(plainSecret);

    const { data: client, error } = await admin
      .from("oauth_clients")
      .insert({
        advertiser_id: advertiser.id,
        name: body.name.trim(),
        scopes: validScopes,
        client_secret_hash: secretHash,
      })
      .select("id, client_id, name, scopes, created_at")
      .single();

    if (error || !client) {
      return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
    }

    // Return secret once — never again
    return NextResponse.json({
      client_id: client.client_id,
      client_secret: plainSecret,
      name: client.name,
      scopes: client.scopes,
      created_at: client.created_at,
      warning: "Save this client_secret now — it will not be shown again.",
    }, { status: 201 });
  } catch (err) {
    console.error('[oauth-clients POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
