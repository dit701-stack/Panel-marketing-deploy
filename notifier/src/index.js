// Standalone Worker (not a Pages Function) so it can run on a Cron Trigger.
// Reads the same "tasks-v1" key the panel writes to PANEL_KV and posts a
// digest to Slack of anything overdue, needing changes, or due tomorrow.
// Silent when there's nothing to report, so the channel doesn't get spammed.

const TEAM_NAMES = {
  cc: "Carlos Cascante",
  cf: "Carlos Fernández",
  ac: "Andrés Calderón",
  db: "Daniel Brenes",
};

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function isoDate(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fmtEsDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_ES[m - 1]}`;
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
}

async function buildDigest(env) {
  const raw = await env.PANEL_KV.get("tasks-v1");
  if (!raw) return null;

  let tasks;
  try {
    tasks = JSON.parse(raw);
  } catch (e) {
    return null;
  }

  const today = isoDate(0);
  const tomorrow = isoDate(1);

  const overdue = [];
  const needsChanges = [];
  const dueSoon = [];

  for (const t of tasks) {
    if (t.status === "terminado") continue;
    const person = TEAM_NAMES[t.assignee] || t.assignee || "sin asignar";

    if (t.due && t.due < today) {
      const late = daysBetween(t.due, today);
      overdue.push(`• *${t.title}* — ${person} _(venció hace ${late} día${late === 1 ? "" : "s"}, ${fmtEsDate(t.due)})_`);
    } else if (t.due === tomorrow) {
      dueSoon.push(`• *${t.title}* — ${person}`);
    }

    if (t.needsChanges) {
      needsChanges.push(`• *${t.title}* — ${person}`);
    }
  }

  if (!overdue.length && !needsChanges.length && !dueSoon.length) return null;

  const parts = [`:rotating_light: *Resumen del Panel de Tareas* — ${fmtEsDate(today)}`];
  if (overdue.length) parts.push(`\n*Atrasadas (${overdue.length})*\n` + overdue.join("\n"));
  if (needsChanges.length) parts.push(`\n*Requieren ajustes (${needsChanges.length})*\n` + needsChanges.join("\n"));
  if (dueSoon.length) parts.push(`\n*Vencen mañana (${dueSoon.length})*\n` + dueSoon.join("\n"));

  return parts.join("\n");
}

async function runDigest(env) {
  const text = await buildDigest(env);
  if (!text) return;
  if (!env.SLACK_WEBHOOK_URL) {
    console.error("SLACK_WEBHOOK_URL secret is not set; skipping send.");
    return;
  }
  const res = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    console.error("Slack webhook responded with", res.status, await res.text());
  }
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runDigest(env));
  },
};
