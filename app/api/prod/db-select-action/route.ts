import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function jsonUtf8(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8({
        ok: false,
        error: "Supabase env missing",
      }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from("tarot_generation_jobs_prod")
      .select("id, job_key, status")
      .limit(1);

    if (error) {
      return jsonUtf8({
        ok: false,
        error: error.message,
      }, 500);
    }

    return jsonUtf8({
      ok: true,
      count: data?.length ?? 0,
      first: data?.[0] ?? null,
    });
  } catch (error) {
    return jsonUtf8({
      ok: false,
      error: String(error),
    }, 500);
  }
}