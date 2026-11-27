// vc-values: matches records to Discogs and stores their current value.
// Called by the app (user JWT) for a small batch, or by pg_cron (x-cron-secret) daily.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL_, SRK, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const GRADE: Record<string, string> = {
  "M": "Mint (M)", "NM": "Near Mint (NM or M-)", "VG+": "Very Good Plus (VG+)", "VG": "Very Good (VG)",
  "G+": "Good Plus (G+)", "G": "Good (G)", "F": "Fair (F)", "P": "Poor (P)",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function dg(token: string, path: string) {
  const wait = last + 1100 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
  const u = "https://api.discogs.com/" + path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
  for (let i = 0; i < 2; i++) {
    const r = await fetch(u, { headers: { "User-Agent": "PetesVinylCollection/1.0 +https://jambal00.github.io/vinyl-collection/" } });
    if (r.status === 429) { await sleep(5000); continue; }
    if (r.status === 404) return null;
    if (r.status === 401) throw new Error("token");
    if (!r.ok) throw new Error("discogs " + r.status);
    return await r.json();
  }
  throw new Error("busy");
}
const enc = encodeURIComponent;
const clean = (s: string) => String(s || "").replace(/["\\/]/g, " ").trim();
const num = (v: unknown) => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

async function match(token: string, r: any): Promise<{ kind: "release" | "master" | "none"; release?: string; master?: string }> {
  if (r.discogs_match && r.discogs_match !== "none" && (r.discogs_release_id || r.discogs_master_id))
    return { kind: r.discogs_match, release: r.discogs_release_id, master: r.discogs_master_id };
  if (r.source === "discogs" && r.source_id) return { kind: "release", release: String(r.source_id) };
  const fmt = "&type=release&format=Vinyl&per_page=10";
  const pick = (j: any) => j && j.results && j.results.length ? j.results[0] : null;
  let hit: any = null;
  if (r.barcode) {
    const digits = String(r.barcode).replace(/\D/g, "");
    hit = pick(await dg(token, "database/search?barcode=" + enc(digits) + fmt));
    if (hit) return { kind: "release", release: String(hit.id), master: hit.master_id ? String(hit.master_id) : undefined };
  }
  if (r.catno) {
    hit = pick(await dg(token, "database/search?catno=" + enc(clean(r.catno)) + "&artist=" + enc(clean(r.artist)) + fmt));
    if (hit) return { kind: "release", release: String(hit.id), master: hit.master_id ? String(hit.master_id) : undefined };
  }
  const m = pick(await dg(token, "database/search?type=master&per_page=5&artist=" + enc(clean(r.artist)) + "&release_title=" + enc(clean(r.title))));
  if (m) return { kind: "master", master: String(m.id) };
  hit = pick(await dg(token, "database/search?artist=" + enc(clean(r.artist)) + "&release_title=" + enc(clean(r.title)) + fmt));
  if (hit) return { kind: "master", release: String(hit.id), master: hit.master_id ? String(hit.master_id) : undefined };
  return { kind: "none" };
}

async function value(token: string, r: any) {
  const mt = await match(token, r);
  const now = new Date().toISOString();
  const base: any = { discogs_match: mt.kind, discogs_release_id: mt.release || null, discogs_master_id: mt.master || null, value_checked_at: now };
  if (mt.kind === "none") return { ...base, value_amount: null, value_basis: "no Discogs match" };
  let lowest: number | null = null, forSale: number | null = null, suggested: number | null = null, basis = "";
  const exactOwned = r.status === "owned" && mt.kind === "release" && mt.release;
  if (exactOwned) {
    const st = await dg(token, "marketplace/stats/" + mt.release + "?curr_abbr=USD");
    if (st) { lowest = num(st.lowest_price?.value); forSale = st.num_for_sale ?? null; }
    const g = GRADE[r.condition_media || ""];
    if (g) {
      const ps = await dg(token, "marketplace/price_suggestions/" + mt.release);
      if (ps && ps[g]) { suggested = num(ps[g].value); }
    }
  } else if (mt.master && !(r.status === "wanted" && !r.any_pressing && mt.kind === "release" && mt.release)) {
    const ms = await dg(token, "masters/" + mt.master);
    if (ms) { lowest = num(ms.lowest_price); forSale = ms.num_for_sale ?? null; }
  } else if (mt.release) {
    const st = await dg(token, "marketplace/stats/" + mt.release + "?curr_abbr=USD");
    if (st) { lowest = num(st.lowest_price?.value); forSale = st.num_for_sale ?? null; }
  }
  let amount: number | null;
  if (suggested != null) { amount = suggested; basis = "Discogs suggestion for " + r.condition_media; }
  else { amount = lowest; basis = lowest == null ? "none for sale" : (mt.kind === "master" ? "lowest listed, any pressing" : "lowest listed"); }
  return { ...base, value_prev: r.value_amount ?? null, value_amount: amount, value_lowest: lowest, value_suggested: suggested, value_for_sale: forSale, value_currency: "USD", value_basis: basis };
}

async function run(owner: string, ids: string[] | null, limit: number, deadline: number) {
  const { data: st } = await db.from("vc_settings").select("discogs_token").eq("owner", owner).maybeSingle();
  const token = st?.discogs_token;
  if (!token) return { ok: false, reason: "token" };
  let q = db.from("vc_records").select("*").eq("owner", owner);
  if (ids && ids.length) q = q.in("id", ids);
  else q = q.or("value_checked_at.is.null,value_checked_at.lt." + new Date(Date.now() - 30 * 864e5).toISOString()).order("value_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
  const { data: recs, error } = await q;
  if (error) return { ok: false, reason: error.message };
  const done: any[] = [];
  for (const r of recs || []) {
    if (Date.now() > deadline) break;
    try {
      const v = await value(token, r);
      await db.from("vc_records").update(v).eq("id", r.id);
      await db.from("vc_values").insert({ record_id: r.id, owner, amount: v.value_amount, lowest: v.value_lowest ?? null, suggested: v.value_suggested ?? null, for_sale: v.value_for_sale ?? null, currency: "USD", basis: v.value_basis });
      done.push({ id: r.id, ...v });
    } catch (e) {
      if ((e as Error).message === "token") return { ok: false, reason: "token-bad", done };
      done.push({ id: r.id, error: (e as Error).message });
    }
  }
  return { ok: true, done };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const deadline = Date.now() + 100_000;
  const body = await req.json().catch(() => ({}));
  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    const { data } = await db.from("vc_internal").select("v").eq("k", "cron_secret").maybeSingle();
    if (!data || data.v !== cron) return json({ ok: false }, 401);
    const { data: owners } = await db.from("vc_settings").select("owner").not("discogs_token", "is", null);
    const out: any[] = [];
    for (const o of owners || []) out.push(await run(o.owner, null, 15, deadline));
    return json({ ok: true, out });
  }
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ ok: false, reason: "auth" }, 401);
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 8) : null;
  return json(await run(u.user.id, ids, 5, deadline));
});
