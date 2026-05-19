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

async function countByQuery(query: any) {
  const { count, error } = await query.select("id", {
    count: "exact",
    head: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
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

    const base = () => {
      let q = supabase.from("tarot_generation_jobs_prod");

      if (batchKey) {
        q = q.eq("batch_key", batchKey);
      }

      return q;
    };

    const [
      totalJobs,
      pending,
      processing,
      generated,
      approved,
      reviewed,
      skipped,
      errorCount,
      waitingMeaning,
    ] = await Promise.all([
      countByQuery(base()),
      countByQuery(base().eq("status", "pending")),
      countByQuery(base().eq("status", "processing")),
      countByQuery(base().eq("status", "generated")),
      countByQuery(base().eq("status", "approved")),
      countByQuery(base().eq("status", "reviewed")),
      countByQuery(base().eq("status", "skipped")),
      countByQuery(base().eq("status", "error")),
      countByQuery(base().eq("status", "waiting_meaning")),
    ]);

    const completed = generated + approved + reviewed + skipped;

    return jsonUtf8({
      ok: true,
      batch_key: batchKey ?? "all",
      total_jobs: totalJobs,
      pending,
      processing,
      generated,
      approved,
      reviewed,
      skipped,
      error: errorCount,
      waiting_meaning: waitingMeaning,
      completion_rate:
        totalJobs > 0 ? Number(((completed / totalJobs) * 100).toFixed(2)) : 0,
      approval_rate:
        totalJobs > 0 ? Number(((approved / totalJobs) * 100).toFixed(2)) : 0,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}