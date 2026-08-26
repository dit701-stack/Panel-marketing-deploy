// Stores task-attachment file bytes in R2 (bound as PANEL_ATTACHMENTS).
// The task record in KV only ever holds attachment metadata (id/name/size/type);
// the actual file content lives here, keyed by that same id.

function isValidKey(key) {
  return !!key && key.length <= 256 && !key.includes("..") && !key.includes("/");
}

export async function onRequestPut(context) {
  const { params, env, request } = context;
  const key = decodeURIComponent(params.id);
  if (!isValidKey(key)) {
    return new Response("Invalid attachment id", { status: 400 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get("name") || key;
  const contentType = request.headers.get("content-type") || "application/octet-stream";

  await env.PANEL_ATTACHMENTS.put(key, request.body, {
    httpMetadata: { contentType },
    customMetadata: { name },
  });

  return new Response("OK");
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const key = decodeURIComponent(params.id);
  if (!isValidKey(key)) {
    return new Response("Invalid attachment id", { status: 400 });
  }

  const object = await env.PANEL_ATTACHMENTS.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  const filename = (object.customMetadata && object.customMetadata.name) || key;
  headers.set(
    "content-disposition",
    "attachment; filename*=UTF-8''" + encodeURIComponent(filename)
  );

  return new Response(object.body, { headers });
}

export async function onRequestDelete(context) {
  const { params, env } = context;
  const key = decodeURIComponent(params.id);
  if (!isValidKey(key)) {
    return new Response("Invalid attachment id", { status: 400 });
  }
  await env.PANEL_ATTACHMENTS.delete(key);
  return new Response("OK");
}
