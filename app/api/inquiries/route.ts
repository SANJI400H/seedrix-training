import { NextResponse } from "next/server";
import { notifyInquiry } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  composeMobile,
  inquiryFormSchema,
} from "@/lib/validation";

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
    const { error } = await supabase.from("inquiries").insert({
      locale: input.locale,
      full_name: input.fullName,
      mobile,
      email: input.email,
      service: input.service,
      emirate: input.emirate,
      delivery_mode: input.deliveryMode,
      status: "new",
    });
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
