"use client";

import { useState } from "react";
import Link from "next/link";

const TOPICS = [
  "Sportsbook advertising & deep links",
  "Streaming / commerce brand campaign",
  "DSP / programmatic API integration",
  "Volume pricing & direct deal structure",
  "Custom moment types",
  "Self-serve platform walkthrough",
  "Other",
];

type Status = "idle" | "loading" | "success" | "error";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1e293b",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 14,
  color: "#F5F3EE",
  outline: "none",
  transition: "border-color 0.15s",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#475569",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 6,
};

export function DemoForm() {
  const [fields, setFields] = useState({
    full_name: "",
    company: "",
    email: "",
    role: "",
    topic: "",
    message: "",
  });
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  function set(key: keyof typeof fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function fieldStyle(name: string): React.CSSProperties {
    return {
      ...inputStyle,
      borderColor: focused === name ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.08)",
      boxShadow: focused === name ? "0 0 0 3px rgba(249,115,22,0.07)" : "none",
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.full_name || !fields.company || !fields.email || !fields.topic) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, source: "demo_page" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        className="rounded-2xl p-10 text-center"
        style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Check mark */}
        <div
          className="mx-auto mb-6 flex items-center justify-center rounded-full"
          style={{ width: 64, height: 64, background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.25)" }}
        >
          <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
            <path d="M2 11L9.5 18.5L26 2" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="font-display mb-4" style={{ fontSize: 40, color: "#F5F3EE", lineHeight: 1 }}>
          REQUEST RECEIVED.
        </h2>
        <p style={{ fontSize: 15, color: "#64748b", lineHeight: 1.7, marginBottom: 32 }}>
          The NORMA advertising team will reach out at{" "}
          <strong style={{ color: "#F5F3EE" }}>{fields.email}</strong> within one business day to schedule your demo.
        </p>
        <Link
          href="/advertisers"
          className="inline-block rounded-xl px-8 py-3 text-sm font-semibold"
          style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
        >
          Explore the platform →
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-8"
      style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <h2 className="font-display mb-2" style={{ fontSize: 28, color: "#F5F3EE", lineHeight: 1 }}>
        REQUEST A DEMO
      </h2>
      <p style={{ fontSize: 13, color: "#334155", marginBottom: 28 }}>
        We&apos;ll confirm a time via email within one business day.
      </p>

      <div className="space-y-5">
        {/* Name + Company */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Full Name *</label>
            <input
              type="text"
              required
              placeholder="Alex Johnson"
              value={fields.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              onFocus={() => setFocused("full_name")}
              onBlur={() => setFocused(null)}
              style={fieldStyle("full_name")}
            />
          </div>
          <div>
            <label style={labelStyle}>Company *</label>
            <input
              type="text"
              required
              placeholder="DraftKings"
              value={fields.company}
              onChange={(e) => set("company", e.target.value)}
              onFocus={() => setFocused("company")}
              onBlur={() => setFocused(null)}
              style={fieldStyle("company")}
            />
          </div>
        </div>

        {/* Email + Role */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Work Email *</label>
            <input
              type="email"
              required
              placeholder="you@company.com"
              value={fields.email}
              onChange={(e) => set("email", e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              style={fieldStyle("email")}
            />
          </div>
          <div>
            <label style={labelStyle}>Your Role</label>
            <input
              type="text"
              placeholder="VP Marketing"
              value={fields.role}
              onChange={(e) => set("role", e.target.value)}
              onFocus={() => setFocused("role")}
              onBlur={() => setFocused(null)}
              style={fieldStyle("role")}
            />
          </div>
        </div>

        {/* Topic */}
        <div>
          <label style={labelStyle}>What would you like to discuss? *</label>
          <select
            required
            value={fields.topic}
            onChange={(e) => set("topic", e.target.value)}
            onFocus={() => setFocused("topic")}
            onBlur={() => setFocused(null)}
            style={{
              ...fieldStyle("topic"),
              appearance: "none",
              WebkitAppearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%236B6B6B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 14px center",
              paddingRight: 36,
              cursor: "pointer",
            }}
          >
            <option value="" disabled style={{ background: "#111" }}>Select a topic…</option>
            {TOPICS.map((t) => (
              <option key={t} value={t} style={{ background: "#111" }}>{t}</option>
            ))}
          </select>
        </div>

        {/* Message */}
        <div>
          <label style={labelStyle}>Anything else? (optional)</label>
          <textarea
            rows={3}
            placeholder="Campaign goals, budget range, timeline…"
            value={fields.message}
            onChange={(e) => set("message", e.target.value)}
            onFocus={() => setFocused("message")}
            onBlur={() => setFocused(null)}
            style={{
              ...fieldStyle("message"),
              resize: "vertical",
              minHeight: 80,
              lineHeight: 1.55,
            }}
          />
        </div>

        {/* Error message */}
        {status === "error" && (
          <p style={{ fontSize: 13, color: "#F87171" }}>{errorMsg}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-xl py-4 text-base font-bold text-white"
          style={{
            background: status === "loading" ? "#CC3D00" : "#f97316",
            opacity: status === "loading" ? 0.7 : 1,
            cursor: status === "loading" ? "not-allowed" : "pointer",
            border: "none",
            transition: "background 0.15s, opacity 0.15s",
          }}
        >
          {status === "loading" ? "Sending…" : "Request Demo"}
        </button>

        <p style={{ fontSize: 12, color: "#1e293b", textAlign: "center" }}>
          We&apos;ll respond within one business day. No spam, ever.
        </p>
      </div>
    </form>
  );
}
