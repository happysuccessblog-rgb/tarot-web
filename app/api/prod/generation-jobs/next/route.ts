import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function jsonUtf8(data: unknown, status = 200) {
  return new NextResponse(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Number(limitParam ?? 1), 10);

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

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    let query = supabase
      .from("tarot_generation_jobs_prod")
      .select("*")
      .eq("status", "pending")
      .order("id", { ascending: true })
      .limit(limit);

    if (batchKey) {
      query = query.eq("batch_key", batchKey);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return jsonUtf8(
        {
          ok: false,
          error: error.message,
        },
        500
      );
    }

    if (!jobs || jobs.length === 0) {
      return jsonUtf8({
        ok: true,
        jobs: [],
        message: "No pending prod jobs",
      });
    }

    const enrichedJobs = [];

    for (const job of jobs) {
      const { data: baseMeaning } = await supabase
        .from("tarot_card_base_meanings_prod")
        .select("*")
        .eq("card_key", job.card_key)
        .eq("is_active", true)
        .maybeSingle();

      const { data: orientationMeaning } = await supabase
        .from("tarot_card_orientation_meanings_prod")
        .select("*")
        .eq("card_key", job.card_key)
        .eq("orientation", job.orientation)
        .eq("is_active", true)
        .maybeSingle();

      enrichedJobs.push({
        ...job,
        base_meaning: baseMeaning ?? null,
        orientation_meaning: orientationMeaning ?? null,
      });
    }

    const jobKeys = jobs.map(
      (job) => job.job_key
    );

    const { error: lockError } = await supabase
      .from("tarot_generation_jobs_prod")
      .update({
        status: "processing",
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("job_key", jobKeys);

    if (lockError) {
      return jsonUtf8(
        {
          ok: false,
          error: lockError.message,
        },
        500
      );
    }

    return jsonUtf8({
      ok: true,
      jobs: enrichedJobs,
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