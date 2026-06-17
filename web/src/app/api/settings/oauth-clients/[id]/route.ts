import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  return supabase.auth.getUser();
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { data: { user } } = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createSupabaseAdmin();

  const { data: advertiser } = await admin
    .from("advertisers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!advertiser) return NextResponse.json({ error: "Advertiser not found" }, { status: 404 });

  // Verify ownership before revoking
  const { data: client } = await admin
    .from("oauth_clients")
    .select("id")
    .eq("id", id)
    .eq("advertiser_id", advertiser.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  await admin
    .from("oauth_clients")
    .update({ is_active: false })
    .eq("id", id);

  return NextResponse.json({ revoked: true });
}
