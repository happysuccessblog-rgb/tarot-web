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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");

    // GPTが limit=10 を送っても必ず1件だけ返す
    const limit = 1;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8(
        { ok: false, error: "Supabase environment variables are missing" },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("tarot_generation_jobs_prod")
      .select("*")
      .eq("status", "generated")
      .order("id", { ascending: true })
      .limit(limit);

    if (batchKey) {
      query = query.eq("batch_key", batchKey);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return jsonUtf8({ ok: false, error: error.message }, 500);
    }

    if (!jobs || jobs.length === 0) {
      return jsonUtf8({
        ok: true,
        jobs: [],
        message: "No generated prod jobs for review",
      });
    }

    return jsonUtf8({
      ok: true,
      jobs,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}