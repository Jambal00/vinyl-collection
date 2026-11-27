// vc-genius: looks up Genius song pages for an album's tracks and Genius's album description.
// Uses the signed-in owner's Genius client access token from vc_settings.genius_token.
import { createClient } from "npm:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)|\[.*?\]/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/^the /, "").trim();
const close = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
async function g(token: string, path: string) {
  const r = await fetch("https://api.genius.com/" + path, { headers: { Authorization: "Bearer " + token, "User-Agent": "PetesVinylCollection/1.0" } });
  if (r.status === 401 || r.status === 403) throw new Error("token");
  if (!r.ok) return null;
  const j = await r.json(); return j && j.response;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ ok: false, reason: "auth" }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "test") {
      const t = String(body.token || "").trim(); if (!t) return json({ ok: false, reason: "bad" });
      const r = await g(t, "search?q=" + encodeURIComponent("Nirvana Lithium"));
      return json(r ? { ok: true } : { ok: false, reason: "net" });
    }
    const { data: st } = await db.from("vc_settings").select("genius_token").eq("owner", u.user.id).maybeSingle();
    const token = st?.genius_token; if (!token) return json({ ok: false, reason: "token" });
    const artist = String(body.artist || ""), tracks: string[] = Array.isArray(body.tracks) ? body.tracks.slice(0, 30).map(String) : [];
    const out: { i: number; url: string; id: number }[] = [];
    const deadline = Date.now() + 40000;
    for (let i = 0; i < tracks.length && Date.now() < deadline; i++) {
      const r = await g(token, "search?q=" + encodeURIComponent(artist + " " + tracks[i]));
      const hit = (r?.hits || []).map((h: any) => h.result).find((s: any) => s && close(s.primary_artist?.name, artist) && close(s.title, tracks[i]));
      if (hit) out.push({ i, url: hit.url, id: hit.id });
    }
    let album: any = null;
    if (out.length) {
      const s = await g(token, "songs/" + out[0].id + "?text_format=plain");
      const al = s?.song?.album;
      if (al?.id && close(al.name, String(body.title || ""))) {
        const a = await g(token, "albums/" + al.id + "?text_format=plain");
        const about = a?.album?.description_annotation?.annotations?.[0]?.body?.plain || "";
        album = { url: a?.album?.url || al.url, about: about && about !== "?" ? about.slice(0, 1500) : "" };
      }
    }
    return json({ ok: true, tracks: out, album });
  } catch (e) {
    if ((e as Error).message === "token") return json({ ok: false, reason: "token-bad" });
    return json({ ok: false, reason: "busy" });
  }
});
