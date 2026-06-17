import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "NORMA for Developers | Agentic Ad Inventory API",
  description:
    "Programmatic access to NORMA push notification inventory. 12–18% CTR on high-intent sports betting moments. REST API, MCP Server, and AdCP-compatible.",
  other: {
    "adcp:endpoint": "https://mcp.getnorma.app",
    "adcp:discovery": "https://getnorma.app/adagents.json",
    "aamp:seller": "true",
  },
};

const MOMENT_TYPES = [
  { key: "bet_resolved",       display: "Bet Resolved",       when: "User's wager settles",                       floor: "$0.50", ctr: "9–15%" },
  { key: "prediction_resolved",display: "Prediction Resolved",when: "Prediction market position resolves",        floor: "$0.60", ctr: "11–17%" },
  { key: "overtime",           display: "Overtime",           when: "Game enters overtime",                       floor: "$0.40", ctr: "12–18%" },
  { key: "close_game",         display: "Close Game",         when: "1-possession game in final minutes",         floor: "$0.35", ctr: "7–13%" },
  { key: "spread_alert",       display: "Spread Alert",       when: "Score crosses user's spread line",           floor: "$0.30", ctr: "6–10%" },
  { key: "moneyline_alert",    display: "Moneyline Alert",    when: "Moneyline bet momentum shift",               floor: "$0.30", ctr: "5–9%" },
  { key: "total_alert",        display: "Total Alert",        when: "Over/under bet at decision point",           floor: "$0.25", ctr: "4–8%" },
  { key: "prop_alert",         display: "Prop Alert",         when: "Player prop approaching its line",           floor: "$0.25", ctr: "4–8%" },
  { key: "position_alert",     display: "Position Alert",     when: "Prediction market position significant move",floor: "$0.20", ctr: "3–7%" },
  { key: "foul_trouble",       display: "Foul Trouble",       when: "Key starter picks up 4th foul",              floor: "$0.15", ctr: "2–6%" },
  { key: "follow_alert",       display: "Follow Alert",       when: "Notable moment for a followed team/player",  floor: "$0.10", ctr: "2–4%" },
];

const QUICKSTART_STEPS = [
  {
    step: 1,
    title: "Register for an API account",
    body: "Sign up at getnorma.app and navigate to Settings → API Access.",
    code: null,
  },
  {
    step: 2,
    title: "Generate OAuth credentials",
    body: "Create a client in Settings → API Access. Save the client_secret — it's shown only once.",
    code: null,
  },
  {
    step: 3,
    title: "Get an access token",
    body: null,
    code: `curl -X POST https://api.getnorma.app/api/auth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_SECRET&scope=campaigns:read campaigns:write reporting:read"`,
  },
  {
    step: 4,
    title: "Fetch moment types",
    body: null,
    code: `curl "https://api.getnorma.app/api/ads/moment-types"
# Returns floor CPMs and CTR ranges for all 11 moment types — no auth required`,
  },
  {
    step: 5,
    title: "Create a campaign",
    body: null,
    code: `curl -X POST https://api.getnorma.app/api/ads/campaigns \\
  -H "Authorization: Bearer {token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "March Madness Push",
    "moment_types": ["bet_resolved", "overtime"],
    "sports": ["ncaa_basketball"],
    "bid_cpm_usd": 0.80,
    "daily_budget_usd": 50.00,
    "total_budget_usd": 500.00,
    "start_date": "2025-03-15",
    "creative": {
      "headline": "Your bet just went live",
      "body": "Check the line before the final buzzer.",
      "icon_url": "https://cdn.example.com/logo.png",
      "action_url": "https://app.example.com/promo",
      "cta_text": "Open App"
    }
  }'`,
  },
  {
    step: 6,
    title: "Pull performance after 24 hours",
    body: null,
    code: `curl "https://api.getnorma.app/api/ads/reporting/campaigns/CAMPAIGN_ID?start_date=2025-03-15&end_date=2025-03-16" \\
  -H "Authorization: Bearer {token}"`,
  },
];

const FAQS = [
  {
    q: "Is this OpenRTB-compatible?",
    a: "Not currently. NORMA uses its own REST API with a second-price Vickrey auction model. OpenRTB integration is on the roadmap for Q3 2025. If you need OpenRTB, contact ads@getnorma.app — we can discuss a DSP adapter.",
  },
  {
    q: "How do I verify NORMA is an authorized seller in AAMP?",
    a: "NORMA is registered in the IAB AAMP seller registry. Check getnorma.app/adagents.json for the agent discovery manifest. We also serve seller-domain verification at /.well-known/openapi.json.",
  },
  {
    q: "What attribution partners are supported?",
    a: "AppsFlyer, Adjust, Singular, and custom postback URLs via the GET /api/ads/postback endpoint. Pass your postback URL in the campaign's postback_url field. Conversions are attributed within a 7-day click window.",
  },
  {
    q: "Can I use frequency capping?",
    a: "Not via the API today. NORMA enforces platform-level frequency limits per user (max 5 alerts per game, 10 per hour) as a user experience requirement. Advertiser-controlled frequency capping is planned for v2.",
  },
  {
    q: "What is the minimum campaign budget?",
    a: "Minimum total budget is $10.00. Minimum daily budget is $5.00. There is no minimum contract — campaigns run pay-as-you-go until the total budget is exhausted or the end date is reached.",
  },
];

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-sm text-green-300 overflow-x-auto whitespace-pre-wrap break-all">
      <code>{code}</code>
    </pre>
  );
}

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-11 w-auto" />
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <a href="#quickstart" className="text-slate-400 hover:text-white">Quickstart</a>
            <a href="#moments" className="text-slate-400 hover:text-white">Inventory</a>
            <a href="/api-docs" className="text-slate-400 hover:text-white">API Reference</a>
            <Link
              href="/auth"
              className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-16 space-y-24">

        {/* ── Hero ── */}
        <section className="text-center space-y-6">
          <p className="text-orange-400 text-sm font-semibold tracking-widest uppercase">NORMA for Agents and Platforms</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
            The only ad inventory tied to a user&apos;s<br className="hidden sm:block" /> active financial stake in a live game.
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            12–18% CTR. Second-price Vickrey auction. Fully programmable via MCP and REST API.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2">
            <a
              href="https://mcp.getnorma.app"
              className="rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600"
            >
              Connect via MCP
            </a>
            <a
              href="/api-docs"
              className="rounded-lg border border-slate-600 px-6 py-3 font-semibold text-white hover:border-slate-400"
            >
              View API Reference
            </a>
            <a
              href="/adagents.json"
              className="rounded-lg border border-slate-600 px-6 py-3 font-semibold text-slate-300 hover:border-slate-400 hover:text-white"
            >
              Download adagents.json
            </a>
          </div>
        </section>

        {/* ── Why NORMA is Different ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-white">Why NORMA is different</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 pr-6 text-slate-500 font-medium w-40"></th>
                  <th className="text-left py-3 pr-6 text-orange-400 font-semibold">NORMA</th>
                  <th className="text-left py-3 text-slate-500 font-medium">Social / Display</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr>
                  <td className="py-3 pr-6 text-slate-500">Ad unit</td>
                  <td className="py-3 pr-6 text-white">Push notification, moment-triggered</td>
                  <td className="py-3 text-slate-400">Banner / feed interruption</td>
                </tr>
                <tr>
                  <td className="py-3 pr-6 text-slate-500">When it fires</td>
                  <td className="py-3 pr-6 text-white">User&apos;s bet is live and at risk</td>
                  <td className="py-3 text-slate-400">Whenever the algorithm decides</td>
                </tr>
                <tr>
                  <td className="py-3 pr-6 text-slate-500">Typical CTR</td>
                  <td className="py-3 pr-6 text-white font-semibold text-green-400">12–18%</td>
                  <td className="py-3 text-slate-400">0.05–0.2%</td>
                </tr>
                <tr>
                  <td className="py-3 pr-6 text-slate-500">Audience signal</td>
                  <td className="py-3 pr-6 text-white">Active wager / prediction position</td>
                  <td className="py-3 text-slate-400">Inferred interest</td>
                </tr>
                <tr>
                  <td className="py-3 pr-6 text-slate-500">Pricing</td>
                  <td className="py-3 pr-6 text-white">Second-price Vickrey, transparent floors</td>
                  <td className="py-3 text-slate-400">Opaque, algorithm-controlled</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Moment Type Inventory ── */}
        <section id="moments" className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Moment type inventory</h2>
            <p className="mt-1 text-slate-400">11 moment types across NCAA basketball, NBA, NFL, and MLB. Each triggers only when the user has relevant financial exposure.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 pr-4 text-slate-500 font-medium">Moment</th>
                  <th className="text-left py-3 pr-4 text-slate-500 font-medium">When it fires</th>
                  <th className="text-left py-3 pr-4 text-slate-500 font-medium">Floor CPM</th>
                  <th className="text-left py-3 text-slate-500 font-medium">Historical CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {MOMENT_TYPES.map((m) => (
                  <tr key={m.key} className="hover:bg-slate-900/50">
                    <td className="py-3 pr-4 text-white font-medium">{m.display}</td>
                    <td className="py-3 pr-4 text-slate-400">{m.when}</td>
                    <td className="py-3 pr-4 text-orange-300 font-mono">{m.floor}</td>
                    <td className="py-3 text-green-400 font-mono">{m.ctr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600">CTR ranges are based on product design targets. Realized rates will vary by creative quality and audience composition. Historical aggregate data will populate as campaigns run.</p>
        </section>

        {/* ── Integration Paths ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-white">Integration paths</h2>
          <div className="grid sm:grid-cols-3 gap-6">

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
              <div>
                <span className="text-xs font-semibold text-orange-400 uppercase tracking-widest">MCP Server</span>
                <h3 className="mt-1 text-lg font-semibold text-white">For AI agents</h3>
                <p className="mt-2 text-sm text-slate-400">Claude, GPT-4o, Gemini, and any MCP-compatible agent can buy inventory directly.</p>
              </div>
              <CodeBlock code={`npm install -g norma-ads-mcp`} />
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-400 hover:text-white">Claude Desktop config</summary>
                <CodeBlock code={`{
  "mcpServers": {
    "norma-ads": {
      "command": "norma-ads-mcp",
      "env": {
        "NORMA_API_KEY": "your_api_key"
      }
    }
  }
}`} />
              </details>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
              <div>
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">REST API</span>
                <h3 className="mt-1 text-lg font-semibold text-white">For custom integrations</h3>
                <p className="mt-2 text-sm text-slate-400">Full programmatic control for DSP integrations and custom buyers.</p>
              </div>
              <CodeBlock code={`curl "https://api.getnorma.app/api/ads/moment-types" \\
  -H "Authorization: Bearer {token}"`} />
              <a
                href="/api-docs"
                className="inline-block text-sm text-blue-400 hover:text-blue-300"
              >
                Full API Reference →
              </a>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
              <div>
                <span className="text-xs font-semibold text-purple-400 uppercase tracking-widest">AdCP / AAMP</span>
                <h3 className="mt-1 text-lg font-semibold text-white">For agentic platforms</h3>
                <p className="mt-2 text-sm text-slate-400">AdCP-compatible discovery manifest. AAMP seller registration in progress.</p>
              </div>
              <CodeBlock code={`# Discovery endpoint
GET /adagents.json
GET /.well-known/adagents.json`} />
              <a
                href="/adagents.json"
                className="inline-block text-sm text-purple-400 hover:text-purple-300"
              >
                View adagents.json →
              </a>
            </div>

          </div>
        </section>

        {/* ── Quickstart ── */}
        <section id="quickstart" className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Get your first campaign running in 5 minutes</h2>
            <p className="mt-1 text-slate-400">All commands are real. Copy-paste and substitute your credentials.</p>
          </div>
          <div className="space-y-8">
            {QUICKSTART_STEPS.map((s) => (
              <div key={s.step} className="flex gap-6">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 text-sm font-bold flex items-center justify-center">
                  {s.step}
                </div>
                <div className="flex-1 space-y-3">
                  <h3 className="font-semibold text-white">{s.title}</h3>
                  {s.body && <p className="text-sm text-slate-400">{s.body}</p>}
                  {s.code && <CodeBlock code={s.code} />}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Performance Benchmarks ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-white">Performance benchmarks</h2>
          <div className="bg-slate-900 border border-amber-800/40 rounded-xl p-6">
            <p className="text-amber-400 text-sm font-semibold mb-2">Live data — populating as campaigns run</p>
            <p className="text-slate-400 text-sm">
              Aggregate CTR and CPA data by moment type will appear here as campaigns accumulate volume.
              The CTR ranges shown in the inventory table above reflect product design targets based on
              the intent signal model — users who receive a notification have an active financial stake
              in the triggering event.
            </p>
            <p className="mt-3 text-slate-400 text-sm">
              For comparison: the industry average CTR for mobile app install ads is 0.5–1.0% (Facebook/Meta, 2024).
              NORMA&apos;s moment-triggered model targets 12–18% on the highest-intent moments (Bet Resolved, Overtime)
              by delivering at the exact second the user&apos;s financial outcome is being decided.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-white">FAQ for platform integrators</h2>
          <div className="space-y-4">
            {FAQS.map((faq, i) => (
              <details
                key={i}
                className="bg-slate-900 border border-slate-700 rounded-xl group"
              >
                <summary className="px-6 py-4 cursor-pointer text-white font-medium hover:text-orange-300 list-none flex justify-between items-center">
                  {faq.q}
                  <span className="text-slate-500 group-open:rotate-180 transition-transform ml-4">▼</span>
                </summary>
                <p className="px-6 pb-5 text-sm text-slate-400 border-t border-slate-800 pt-4">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Footer CTA ── */}
        <section className="text-center border-t border-slate-800 pt-16 space-y-4">
          <h2 className="text-2xl font-bold text-white">Ready to connect?</h2>
          <p className="text-slate-400">Talk to us about DSP integration, volume pricing, or custom moment types.</p>
          <div className="flex flex-wrap justify-center items-center gap-6 text-sm">
            <a href="mailto:ads@getnorma.app" className="text-orange-400 hover:text-orange-300 font-medium">
              ads@getnorma.app
            </a>
            <span className="text-slate-700">|</span>
            <a
              href="/demo"
              className="rounded-lg border border-slate-600 px-5 py-2 font-semibold text-white hover:border-slate-400"
            >
              Schedule a demo
            </a>
            <span className="text-slate-700">|</span>
            <a href="/api-docs" className="text-slate-400 hover:text-white">
              API Reference →
            </a>
          </div>
        </section>

      </main>
    </div>
  );
}
