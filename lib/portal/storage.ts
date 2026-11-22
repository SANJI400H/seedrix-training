import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Short-lived signed URL for a private teacher photo (null if Storage isn't available). */
export async function teacherPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data } = await admin.storage.from("teacher-photos").createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
