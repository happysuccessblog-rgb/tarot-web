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
      return jsonUtf8(
        {
          ok: false,
          error: "Supabase environment variables are missing",
        },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from("tarot_generation_jobs_prod")
      .select("status")
      .limit(1000);

    if (error) {
      return jsonUtf8(
        {
          ok: false,
          error: error.message,
        },
        500
      );
    }

    const stats = {
      total_sampled: data?.length ?? 0,
      pending: 0,
      processing: 0,
      generated: 0,
      approved: 0,
      reviewed: 0,
      skipped: 0,
      error: 0,
      waiting_meaning: 0,
    };

    for (const row of data ?? []) {
      const status = row.status ?? "error";

      if (status === "pending") stats.pending++;
      else if (status === "processing") stats.processing++;
      else if (status === "generated") stats.generated++;
      else if (status === "approved") stats.approved++;
      else if (status === "reviewed") stats.reviewed++;
      else if (status === "skipped") stats.skipped++;
      else if (status === "waiting_meaning") stats.waiting_meaning++;
      else stats.error++;
    }

    return jsonUtf8({
      ok: true,
      mode: "action_smoke_test",
      ...stats,
    });
  } catch (error) {
    return jsonUtf8(
      {
        ok: false,
        error: String(error),
      },
      500
    );
  }
}