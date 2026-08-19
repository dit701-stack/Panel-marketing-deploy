// Optional: lists stored keys by prefix. Not required by the app today,
// but implemented for parity with the window.storage.list() API.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "";
  const list = await env.PANEL_KV.list({ prefix });
  return new Response(
    JSON.stringify({ keys: list.keys.map((k) => k.name), prefix }),
    { headers: { "content-type": "application/json" } }
  );
}
