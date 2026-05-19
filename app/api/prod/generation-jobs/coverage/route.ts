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

type JobStatus =
  | "pending"
  | "processing"
  | "generated"
  | "approved"
  | "reviewed"
  | "skipped"
  | "error"
  | "waiting_meaning";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const batchKey = searchParams.get("batch_key");

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

    const pageSize = 1000;
    let from = 0;
    let to = pageSize - 1;
    let hasMore = true;

    const stats: Record<JobStatus, number> = {
      pending: 0,
      processing: 0,
      generated: 0,
      approved: 0,
      reviewed: 0,
      skipped: 0,
      error: 0,
      waiting_meaning: 0,
    };

    let totalJobs = 0;

    while (hasMore) {
      let query = supabase
        .from("tarot_generation_jobs_prod")
        .select("status")
        .range(from, to);

      if (batchKey) {
        query = query.eq("batch_key", batchKey);
      }

      const { data, error } = await query;

      if (error) {
        return jsonUtf8(
          {
            ok: false,
            error: error.message,
          },
          500
        );
      }

      const rows = data ?? [];

      for (const row of rows) {
        const status = (row.status ?? "error") as JobStatus;

        if (status in stats) {
          stats[status]++;
        } else {
          stats.error++;
        }

        totalJobs++;
      }

      if (rows.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
        to += pageSize;
      }
    }

    const completed =
      stats.generated + stats.approved + stats.reviewed + stats.skipped;

    return jsonUtf8({
      ok: true,
      batch_key: batchKey ?? "all",
      total_jobs: totalJobs,
      pending: stats.pending,
      processing: stats.processing,
      generated: stats.generated,
      approved: stats.approved,
      reviewed: stats.reviewed,
      skipped: stats.skipped,
      error: stats.error,
      waiting_meaning: stats.waiting_meaning,
      completion_rate:
        totalJobs > 0 ? Number(((completed / totalJobs) * 100).toFixed(2)) : 0,
      approval_rate:
        totalJobs > 0
          ? Number(((stats.approved / totalJobs) * 100).toFixed(2))
          : 0,
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