import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function jsonUtf8(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");

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
      .select("status", { count: "exact" });

    if (batchKey) {
      query = query.eq("batch_key", batchKey);
    }

    const { data, error, count } = await query;

    if (error) {
      return jsonUtf8({ ok: false, error: error.message }, 500);
    }

    const stats: Record<string, number> = {
      total_jobs: count ?? 0,
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

      if (status in stats) {
        stats[status]++;
      } else {
        stats.error++;
      }
    }

    const completed =
      stats.generated +
      stats.approved +
      stats.reviewed +
      stats.skipped;

    const completionRate =
      stats.total_jobs > 0
        ? Number(((completed / stats.total_jobs) * 100).toFixed(2))
        : 0;

    const approvalRate =
      stats.total_jobs > 0
        ? Number(((stats.approved / stats.total_jobs) * 100).toFixed(2))
        : 0;

    return jsonUtf8({
      ok: true,
      batch_key: batchKey ?? "all",

      total_jobs: stats.total_jobs,

      pending: stats.pending,
      processing: stats.processing,
      generated: stats.generated,
      approved: stats.approved,
      reviewed: stats.reviewed,
      skipped: stats.skipped,
      error: stats.error,
      waiting_meaning: stats.waiting_meaning,

      completion_rate: completionRate,
      approval_rate: approvalRate,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}