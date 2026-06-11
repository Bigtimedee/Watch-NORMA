import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Use service role to bypass RLS read restriction while still inserting
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
      .from("waitlist_emails")
      .insert({ email: trimmed, source: "landing_page" });

    if (error) {
      // Duplicate email — treat as success to avoid enumeration
      if (error.code === "23505") {
        return NextResponse.json({ success: true });
      }
      console.error("waitlist insert error:", error.message);
      return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("waitlist route error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
