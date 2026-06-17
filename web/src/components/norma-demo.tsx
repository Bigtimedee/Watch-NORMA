"use client";

// Animated iPhone mockup showing a live game + NORMA push notification arriving

export function NormaDemo() {
  return (
    <div
      className="relative mx-auto select-none"
      style={{ width: 270, height: 540 }}
      aria-hidden="true"
    >
      {/* ── Outer ambient glow ── */}
      <div
        className="absolute inset-0 rounded-[50px] blur-3xl opacity-30 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 80%, #f97316, transparent 70%)", zIndex: 0 }}
      />

      {/* ── iPhone shell ── */}
      <div
        className="absolute inset-0 rounded-[46px] overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #1e293b 0%, #1A1A1A 100%)",
          border: "1px solid rgba(255,255,255,0.16)",
          boxShadow:
            "0 50px 100px rgba(0,0,0,0.7), 0 20px 40px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
          zIndex: 1,
        }}
      >
        {/* ── Screen bezel ── */}
        <div
          className="absolute rounded-[44px] overflow-hidden"
          style={{
            inset: "2px 2px 2px 2px",
            background: "#090909",
          }}
        >
          {/* Dynamic Island */}
          <div
            className="absolute left-1/2 -translate-x-1/2 z-20 rounded-full"
            style={{
              top: 10,
              width: 120,
              height: 34,
              background: "#000",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
            }}
          />

          {/* Status bar */}
          <div className="absolute top-3 left-6 z-10" style={{ color: "#F5F3EE", fontSize: 13, fontWeight: 600 }}>
            9:41
          </div>
          <div className="absolute top-3 right-5 z-10 flex items-center gap-1">
            <svg width="16" height="11" viewBox="0 0 16 11" fill="#F5F3EE" opacity="0.8">
              <rect x="0" y="4" width="3" height="7" rx="1"/>
              <rect x="4.5" y="2.5" width="3" height="8.5" rx="1"/>
              <rect x="9" y="0.5" width="3" height="10.5" rx="1"/>
              <rect x="13.5" y="0.5" width="2" height="10.5" rx="1" opacity="0.3"/>
            </svg>
          </div>

          {/* ── Live game screen ── */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ paddingTop: 56, paddingBottom: 20, paddingLeft: 16, paddingRight: 16 }}
          >
            {/* League label */}
            <div
              className="text-xs font-bold tracking-widest uppercase mb-4"
              style={{ color: "#f97316", letterSpacing: "0.14em" }}
            >
              NBA · LIVE Q4
            </div>

            {/* Score row */}
            <div className="w-full flex items-center justify-between mb-2">
              {/* Home team */}
              <div className="text-center flex-1">
                <div
                  className="font-display tracking-wide"
                  style={{ fontSize: 22, color: "#F5F3EE", lineHeight: 1 }}
                >
                  MIA
                </div>
                <div
                  className="font-display mt-1"
                  style={{ fontSize: 52, color: "#F5F3EE", lineHeight: 1 }}
                >
                  112
                </div>
              </div>

              {/* Center clock */}
              <div className="text-center px-2" style={{ minWidth: 52 }}>
                <div
                  className="font-bold"
                  style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.06em" }}
                >
                  FINAL
                </div>
                <div
                  className="font-bold mt-1"
                  style={{ fontSize: 18, color: "#F5F3EE" }}
                >
                  1:23
                </div>
                <div
                  style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.06em" }}
                >
                  LEFT
                </div>
              </div>

              {/* Away team */}
              <div className="text-center flex-1">
                <div
                  className="font-display tracking-wide"
                  style={{ fontSize: 22, color: "#F5F3EE", lineHeight: 1 }}
                >
                  BOS
                </div>
                <div
                  className="font-display mt-1"
                  style={{ fontSize: 52, color: "#F5F3EE", lineHeight: 1 }}
                >
                  109
                </div>
              </div>
            </div>

            {/* Live wager status pill */}
            <div
              className="flex items-center gap-2 mt-3 rounded-full px-4 py-2"
              style={{
                background: "rgba(249,115,22,0.1)",
                border: "1px solid rgba(249,115,22,0.22)",
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#f97316", animation: "pulse-dot 1.6s ease-in-out infinite" }}
              />
              <span
                className="font-semibold uppercase"
                style={{ fontSize: 10, color: "#f97316", letterSpacing: "0.1em" }}
              >
                MIA -3.5 · YOUR BET
              </span>
            </div>

            {/* Spread indicator */}
            <div className="mt-4 w-full">
              <div className="flex justify-between mb-1.5" style={{ fontSize: 10, color: "#64748b" }}>
                <span>SPREAD: MIA -3.5</span>
                <span style={{ color: "#4ADE80" }}>COVERING +3</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 4, height: 4 }}>
                <div
                  style={{ background: "#4ADE80", borderRadius: 4, height: "100%", width: "62%" }}
                />
              </div>
            </div>
          </div>

          {/* ── NORMA Push Notification ── */}
          <div
            className="absolute left-0 right-0 z-30 px-2.5"
            style={{
              top: 0,
              animation: "norma-notify 9s cubic-bezier(0.34, 1.1, 0.64, 1) infinite",
              paddingTop: 54,
            }}
          >
            <div
              className="rounded-2xl p-3.5 shadow-2xl"
              style={{
                background: "rgba(26,26,26,0.97)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
              }}
            >
              {/* Notification header */}
              <div className="flex items-center gap-2.5">
                {/* App icon */}
                <div
                  className="rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ width: 38, height: 38, background: "#f97316" }}
                >
                  <span
                    className="font-display text-white"
                    style={{ fontSize: 18, lineHeight: 1 }}
                  >
                    N
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white" style={{ fontSize: 12 }}>
                      NORMA
                    </span>
                    <span style={{ fontSize: 11, color: "#8E8E93" }}>now</span>
                  </div>
                  <div className="font-bold text-white leading-tight mt-0.5" style={{ fontSize: 12 }}>
                    Your spread is covering 🔥
                  </div>
                  <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 1, lineHeight: 1.3 }}>
                    MIA leads by 3 · 1:23 left in Q4
                  </div>
                </div>
              </div>

              {/* CTA buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  className="flex-1 rounded-xl text-white font-bold text-center"
                  style={{
                    background: "#f97316",
                    fontSize: 11,
                    padding: "6px 0",
                    border: "none",
                  }}
                >
                  Watch Now
                </button>
                <div
                  className="rounded-xl text-center"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#AEAEB2",
                    fontSize: 11,
                    padding: "6px 14px",
                    cursor: "default",
                  }}
                >
                  Dismiss
                </div>
              </div>

              {/* Sponsor attribution */}
              <div
                className="text-center mt-2"
                style={{ fontSize: 9.5, color: "#48484A", letterSpacing: "0.03em" }}
              >
                Sponsored · DraftKings Sportsbook
              </div>
            </div>
          </div>

          {/* Home indicator */}
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full"
            style={{ width: 120, height: 5, background: "rgba(255,255,255,0.2)" }}
          />
        </div>
      </div>

      {/* Physical side buttons */}
      <div
        className="absolute rounded-l-sm"
        style={{ left: -2, top: 96, width: 3, height: 32, background: "#1e293b", zIndex: 2 }}
      />
      <div
        className="absolute rounded-l-sm"
        style={{ left: -2, top: 144, width: 3, height: 60, background: "#1e293b", zIndex: 2 }}
      />
      <div
        className="absolute rounded-l-sm"
        style={{ left: -2, top: 214, width: 3, height: 60, background: "#1e293b", zIndex: 2 }}
      />
      <div
        className="absolute rounded-r-sm"
        style={{ right: -2, top: 120, width: 3, height: 76, background: "#1e293b", zIndex: 2 }}
      />
    </div>
  );
}
