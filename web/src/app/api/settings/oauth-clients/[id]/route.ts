import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user ?? null;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const admin = createSupabaseAdmin();

    const { data: advertiser } = await admin
      .from("advertisers")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!advertiser) return NextResponse.json({ error: "Advertiser not found" }, { status: 404 });

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
  } catch (err) {
    console.error('[oauth-clients DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
