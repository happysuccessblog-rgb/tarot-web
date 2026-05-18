import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Supabase environment variables are missing",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("tarot_generation_jobs")
      .select("status", { count: "exact" });

    if (batchKey) {
      query = query.eq("batch_key", batchKey);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const rows = data ?? [];

    const stats = {
      total_jobs: count ?? 0,
      pending: 0,
      processing: 0,
      generated: 0,
      approved: 0,
      reviewed: 0,
      skipped: 0,
      error: 0,
    };

    for (const row of rows) {
      const status = row.status ?? "unknown";

      if (status === "pending") stats.pending++;
      else if (status === "processing") stats.processing++;
      else if (status === "generated") stats.generated++;
      else if (status === "approved") stats.approved++;
      else if (status === "reviewed") stats.reviewed++;
      else if (status === "skipped") stats.skipped++;
      else stats.error++;
    }

    const completionRate =
      stats.total_jobs > 0
        ? Number(
            (
              ((stats.generated +
                stats.approved +
                stats.reviewed +
                stats.skipped) /
                stats.total_jobs) *
              100
            ).toFixed(2)
          )
        : 0;

    const approvalRate =
      stats.total_jobs > 0
        ? Number(
            (
              (stats.approved / stats.total_jobs) *
              100
            ).toFixed(2)
          )
        : 0;

    return NextResponse.json({
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

      completion_rate: completionRate,
      approval_rate: approvalRate,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}