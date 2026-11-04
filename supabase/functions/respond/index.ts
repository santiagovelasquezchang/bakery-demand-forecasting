import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Optional secrets (emails are skipped until RESEND_API_KEY + EMAIL_FROM exist):
// RESEND_API_KEY, EMAIL_FROM ("Sample Bakery <hello@yourdomain.com>"),
// OWNER_EMAIL (reply-to), OWNER_WHATSAPP (digits with country code, e.g. 17655550123), SITE_URL

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

const money = (n: number) => "$" + Number(n).toFixed(2).replace(/\.00$/, "");

const REASONS = ['calendar_full', 'not_enough_time', 'unavailable', 'other'];

function contactBlock(kind: "order" | "quote", number: string) {
  const wa = Deno.env.get("OWNER_WHATSAPP");
  const mail = Deno.env.get("OWNER_EMAIL");
  const text = encodeURIComponent(`Hi! This is about my ${kind} ${number}.`);
  return `
    <div style="margin:28px 0 8px">
      ${wa ? `<a href="https://wa.me/${esc(wa)}?text=${text}" style="display:inline-block;background:#A31B3B;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;margin:0 8px 8px 0">Message the baker on WhatsApp</a>` : ""}
      ${mail ? `<a href="mailto:${esc(mail)}?subject=${encodeURIComponent(`${kind === "order" ? "Order" : "Quote"} ${number}`)}" style="display:inline-block;border:1.5px solid #A31B3B;color:#A31B3B;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600">Reply by email</a>` : ""}
    </div>
    <p style="color:#5B4438;font-size:14px;margin:0">You can also simply reply to this email.</p>`;
}

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#FBF3E4;font-family:Helvetica,Arial,sans-serif;color:#2B1810">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-family:Georgia,serif;font-style:italic;font-size:26px;color:#7A1330;margin-bottom:20px">Sample Bakery</div>
    <div style="background:#FFFDF9;border-radius:16px;padding:32px 28px">
      <h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 16px;color:#2B1810">${title}</h1>
      ${body}
    </div>
    <p style="color:#8a7468;font-size:12px;text-align:center;margin-top:20px">Sample Bakery · You dream it, we bake it.</p>
  </div></body></html>`;
}

const p = (t: string) => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px">${t}</p>`;
const explain = (m?: string | null) =>
  m ? `<div style="background:#F5E9D6;border-radius:12px;padding:16px 18px;margin:18px 0;font-size:15px;line-height:1.6">${esc(m).replace(/\n/g, "<br>")}<br><span style="color:#7A1330">— the baker</span></div>` : "";
const depositBlock = (amount: number, pct: number) =>
  `<div style="border:1.5px solid #C9A24B;border-radius:12px;padding:14px 18px;margin:18px 0;font-size:15px;line-height:1.6"><strong>Deposit to confirm: ${money(amount)}</strong> (${pct}% of the total).<br>the baker will let you know how to pay it. Your date is reserved once the deposit is received.</div>`;
const note = (m?: string | null) =>
  m ? `<div style="background:#F5E9D6;border-radius:12px;padding:16px 18px;margin:18px 0;font-size:15px;line-height:1.6"><strong>A note from the baker:</strong><br>${esc(m).replace(/\n/g, "<br>")}</div>` : "";

function buildEmail(kind: "order" | "quote", action: string, row: Record<string, any>, depositPct: number) {
  const first = esc(String(row.customer_name).split(" ")[0]);
  const catering = row.kind === "catering";
  const what = kind === "order" ? "order" : catering ? "catering request" : "cake request";
  const dateField = kind === "order" ? row.pickup_date : row.event_date;
  const date = fmtDate(dateField);
  const suggested = row.suggested_date ? fmtDate(row.suggested_date) : null;

  if (action === "decline") {
    return {
      subject: `About your ${what} ${row.number}`,
      html: layout("We're so sorry we can't take this one", [
        p(`Hi ${first},`),
        p(`Thank you so much for thinking of us for ${kind === "order" ? "your order" : "your celebration"}. Unfortunately the baker can't take it for ${date}, and she wanted to explain why:`),
        explain(row.response_message),
        p(`We'd truly love to bake for you another time.${suggested ? ` <strong>${suggested}</strong> is open if that date could work for you.` : " If another date works for you, just let us know and we'll check right away."}`),
        kind === "order" ? p("You haven't been charged anything.") : "",
        contactBlock(kind, row.number),
      ].join("")),
    };
  }

  if (kind === "order" && action === "accept") {
    const items = (row.items as any[]).map((i) =>
      `<tr><td style="padding:8px 0;border-bottom:1px solid #EBD9BE">${esc(i.name)}${i.qty > 1 ? ` × ${i.qty}` : ""}<br><span style="color:#5B4438;font-size:13px">${(i.details || []).map(esc).join(" · ")}</span></td><td style="padding:8px 0;border-bottom:1px solid #EBD9BE;text-align:right;white-space:nowrap">${money(i.unitPrice * i.qty)}</td></tr>`
    ).join("");
    return {
      subject: `Your order ${row.number} is confirmed!`,
      html: layout("Your order is confirmed!", [
        p(`Hi ${first}, great news — the baker has confirmed your order and it's on the calendar.`),
        p(`<strong>Pickup:</strong> ${date}<br><strong>Order:</strong> ${esc(row.number)}`),
        `<table style="width:100%;border-collapse:collapse;font-size:15px;margin:10px 0 6px">${items}
          <tr><td style="padding:10px 0;font-weight:bold">Total</td><td style="padding:10px 0;text-align:right;font-weight:bold">${money(row.total)}</td></tr></table>`,
        depositBlock(Number(row.deposit_amount ?? Math.round(row.total * depositPct) / 100), depositPct),
        note(row.response_message),
        p("If you have any questions before pickup, we're here:"),
        contactBlock(kind, row.number),
      ].join("")),
    };
  }

  if (kind === "quote" && action === "accept") {
    return {
      subject: `Your ${catering ? "catering" : "custom cake"} quote ${row.number}`,
      html: layout(`Here's your ${catering ? "catering" : "custom cake"} quote`, [
        p(`Hi ${first}, the baker loved your idea and would be happy to make it for ${date}.`),
        `<div style="text-align:center;margin:22px 0"><div style="font-size:13px;color:#5B4438;text-transform:uppercase;letter-spacing:.12em">Your price</div><div style="font-family:Georgia,serif;font-size:38px;color:#A31B3B">${money(row.quoted_price)}</div></div>`,
        depositBlock(Math.round(Number(row.quoted_price) * depositPct) / 100, depositPct),
        note(row.response_message),
        p("To go ahead, just reply to this email or send the baker a message."),
        contactBlock(kind, row.number),
      ].join("")),
    };
  }

  return {
    subject: `Let's talk about your ${catering ? "event" : "cake"} — ${row.number}`,
    html: layout(`The baker would love to talk about your ${catering ? "event" : "cake"}`, [
      p(`Hi ${first}, thank you for your request for ${date}! Before giving you a price, the baker would like to chat for a few minutes to get the details just right.`),
      note(row.response_message),
      p("Reach out whichever way is easiest for you:"),
      contactBlock(kind, row.number),
    ].join("")),
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, reply_to: Deno.env.get("OWNER_EMAIL") || undefined }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  const { data: isAdmin } = await db.rpc("is_admin");
  if (!isAdmin) return json({ error: "Not allowed" }, 403);

  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const action = body?.action;
  const table = kind === "order" ? "orders" : kind === "quote" ? "quotes" : null;
  const allowed = kind === "order" ? ["accept", "decline"] : ["accept", "decline", "conversation"];
  if (!table || !allowed.includes(action) || typeof body.id !== "string") return json({ error: "Bad request" }, 400);
  if (action === "decline" && !REASONS.includes(body.reason)) return json({ error: "Missing reason" }, 400);
  if (action === "decline" && String(body.message || "").trim().length < 10) {
    return json({ error: "Escribe la explicación para el cliente" }, 400);
  }
  if (kind === "quote" && action === "accept" && !(Number(body.price) > 0)) return json({ error: "Missing price" }, 400);

  const update: Record<string, unknown> = {
    status: action === "accept" ? "accepted" : action === "decline" ? "declined" : "conversation",
    decline_reason: action === "decline" ? body.reason : null,
    response_message: String(body.message || "").trim().slice(0, 1000) || null,
    suggested_date: action === "decline" && body.suggestedDate ? body.suggestedDate : null,
    responded_at: new Date().toISOString(),
  };
  if (kind === "quote") update.quoted_price = action === "accept" ? Number(body.price) : null;

  const { data: row, error } = await db.from(table).update(update).eq("id", body.id).select().single();
  if (error || !row) return json({ error: error?.message || "Not found" }, 400);

  const { data: dep } = await db.from("site_settings").select("value").eq("key", "deposit").maybeSingle();
  const depositPct = Number(dep?.value?.percent ?? 50);
  const email = buildEmail(kind, action, row, depositPct);
  const sent = await sendEmail(row.email, email.subject, email.html);
  if (sent) await db.from(table).update({ email_sent: true }).eq("id", row.id);

  return json({ ok: true, emailSent: sent, preview: email });
});
