// Funzione "coach": riceve i messaggi dall'app, li gira a Claude e restituisce il testo.
// La chiave sta nel segreto ANTHROPIC_API_KEY di Supabase, mai nel codice e mai nel telefono.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELS: Record<string, string> = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5" };

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "method" });

  // Solo chi ha fatto il login puo' usare il coach.
  const auth = req.headers.get("authorization") || "";
  const apikey = req.headers.get("apikey") || "";
  const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!who.ok) return reply(401, { error: "not_logged_in" });

  let body: { messages?: unknown; tier?: string };
  try { body = await req.json(); } catch { return reply(400, { error: "bad_json" }); }

  const raw = Array.isArray(body.messages) ? body.messages.slice(-14) : [];
  const messages = raw
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 40000) }));
  if (!messages.length || messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    return reply(400, { error: "bad_messages" });
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return reply(500, { error: "missing_key" });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELS[body.tier || "default"] || MODELS.default, max_tokens: 1400, messages }),
  });
  if (r.status === 429) return reply(429, { error: "rate_limited" });
  if (!r.ok) return reply(502, { error: "upstream", status: r.status });
  const out = await r.json();
  const text = (out.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return reply(200, { text });
});
