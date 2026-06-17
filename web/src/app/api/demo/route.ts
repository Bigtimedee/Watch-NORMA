import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { full_name, company, email, role, topic, message, source } = body;

    if (!full_name?.trim() || !company?.trim() || !email?.trim() || !topic?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.from("demo_requests").insert({
      full_name: full_name.trim(),
      company: company.trim(),
      email: trimmedEmail,
      role: role?.trim() || null,
      topic: topic.trim(),
      message: message?.trim() || null,
      source: source ?? "demo_page",
      status: "new",
    });

    if (error) {
      console.error("demo_requests insert error:", error.message);
      return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("demo route error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
