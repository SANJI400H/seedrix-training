import { NextResponse } from "next/server";
import { ingestLead } from "@/lib/leads/ingest";
import { leadgenIds, mapMetaLead, verifyMetaSignature, type MetaGraphLead } from "@/lib/leads/meta";
import { getSupabaseAdmin } from "@/lib/supabase";

const GRAPH = "https://graph.facebook.com/v21.0";
const FIELDS = "created_time,field_data,ad_name,adset_name,campaign_name,form_id,platform";

function missing(...names: string[]) {
  const m = names.filter((n) => !process.env[n]);
  return m.length
    ? NextResponse.json({ error: `Meta Lead Ads is not configured: set ${m.join(", ")} (see docs/STAFF_PORTAL.md)` }, { status: 503 })
    : null;
}

/** Webhook verification (Meta calls this once when you save the callback URL). */
export async function GET(request: Request) {
  const notSet = missing("META_VERIFY_TOKEN");
  if (notSet) return notSet;
  const sp = new URL(request.url).searchParams;
  if (sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

/** leadgen events: verify the signature, fetch each lead from the Graph API, ingest it. */
export async function POST(request: Request) {
  const notSet = missing("META_APP_SECRET", "META_PAGE_ACCESS_TOKEN");
  if (notSet) return notSet;
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET!)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const results: Array<{ leadgenId: string; status: string }> = [];
  for (const { leadgenId } of leadgenIds(body)) {
    try {
      const res = await fetch(`${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${FIELDS}&access_token=${encodeURIComponent(process.env.META_PAGE_ACCESS_TOKEN!)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("meta graph", leadgenId, res.status, await res.text().catch(() => ""));
        results.push({ leadgenId, status: `graph_${res.status}` });
        continue;
      }
      const lead = (await res.json()) as MetaGraphLead;
      const r = await ingestLead(db, mapMetaLead({ ...lead, id: lead.id ?? leadgenId }));
      results.push({ leadgenId, status: r.ok ? r.status : `error_${r.error}` });
    } catch (e) {
      console.error("meta lead", leadgenId, e);
      results.push({ leadgenId, status: "error" });
    }
  }
  // Always 200 once the signature is valid so Meta doesn't retry forever; failures are logged.
  return NextResponse.json({ received: results.length, results });
}
