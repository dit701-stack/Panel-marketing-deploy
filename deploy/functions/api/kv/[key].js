// Generic key-value proxy used by the app's window.storage polyfill.
// Bind a KV namespace called PANEL_KV to this Pages project (see README.md).

export async function onRequestGet(context) {
  const { params, env } = context;
  const key = decodeURIComponent(params.key);
  const value = await env.PANEL_KV.get(key);
  if (value === null) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(value, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function onRequestPut(context) {
  const { params, env, request } = context;
  const key = decodeURIComponent(params.key);
  const body = await request.text();
  await env.PANEL_KV.put(key, body);
  return new Response("OK");
}

export async function onRequestDelete(context) {
  const { params, env } = context;
  const key = decodeURIComponent(params.key);
  await env.PANEL_KV.delete(key);
  return new Response("OK");
}
