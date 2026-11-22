import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { notifyInquiry } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  composeMobile,
  inquiryFormSchema,
} from "@/lib/validation";

const attrSchema = z
  .object({
    utm_source: z.string().max(300),
    utm_medium: z.string().max(300),
    utm_campaign: z.string().max(300),
    utm_content: z.string().max(300),
    utm_term: z.string().max(300),
    referrer: z.string().max(500),
    landing_page: z.string().max(500),
    gclid: z.string().max(300),
    fbclid: z.string().max(300),
    ttclid: z.string().max(300),
    sccid: z.string().max(300),
  })
  .partial()
  .strip();

/** Ad / UTM attribution saved by the AttributionCapture cookie on first landing. */
async function readAttribution() {
  try {
    const raw = (await cookies()).get("srx_attr")?.value;
    if (!raw) return {};
    const parsed = attrSchema.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = inquiryFormSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const mobile = composeMobile(input.countryCode, input.nationalNumber);
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const base = {
      locale: input.locale,
      full_name: input.fullName,
      mobile,
      email: input.email,
      service: input.service,
      emirate: input.emirate,
      delivery_mode: input.deliveryMode,
      status: "new",
    };
    let { error } = await supabase.from("inquiries").insert({ ...base, ...(await readAttribution()) });
    // database without migration 003 yet: store the enquiry without attribution
    if (error?.code === "42703" || error?.code === "PGRST204") ({ error } = await supabase.from("inquiries").insert(base));
    if (error) {
      console.error("inquiry insert", error);
      return NextResponse.json({ error: "store_failed" }, { status: 500 });
    }
  } else {
    console.warn("Supabase not configured — inquiry accepted without persist", {
      email: input.email,
      mobile,
    });
  }

  try {
    await notifyInquiry(input);
  } catch (err) {
    console.error("inquiry email", err);
  }

  return NextResponse.json({ ok: true });
}
