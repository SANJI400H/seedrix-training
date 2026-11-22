import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestLead } from "@/lib/leads/ingest";
import { getSupabaseAdmin } from "@/lib/supabase";

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Generic lead webhook for n8n / Make / Zapier (TikTok, Snapchat, Google lead forms…).
 * Header: x-lead-secret: $LEAD_INGEST_SECRET. Body: see docs/STAFF_PORTAL.md.
 */
export async function POST(request: Request) {
  const secret = process.env.LEAD_INGEST_SECRET;
  if (!secret) return NextResponse.json({ error: "LEAD_INGEST_SECRET is not set on the server" }, { status: 503 });
  const given = request.headers.get("x-lead-secret") ?? "";
  if (!sameSecret(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  const r = await ingestLead(db, body);
  if (!r.ok) return NextResponse.json({ error: r.error, details: r.details }, { status: r.status });
  return NextResponse.json({ status: r.status, id: r.leadId, assigned: !!r.assignedRepId }, { status: r.status === "created" ? 201 : 200 });
}
