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

    // 重要：
    // GPTが limit=10 を送っても、必ず1件だけ取得・ロックする
    const limit = 1;

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

    let query = supabase
      .from("tarot_generation_jobs_prod")
      .select("*")
      .eq("status", "pending")
      .order("id", { ascending: true })
      .limit(20);

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
    const validJobKeys: string[] = [];

    for (const job of jobs) {
      const { data: baseMeaning, error: baseError } = await supabase
        .from("tarot_card_base_meanings_prod")
        .select("*")
        .eq("card_key", job.card_key)
        .eq("is_active", true)
        .maybeSingle();

      if (baseError) {
        return jsonUtf8(
          {
            ok: false,
            error: baseError.message,
          },
          500
        );
      }

      const { data: orientationMeaning, error: orientationError } =
        await supabase
          .from("tarot_card_orientation_meanings_prod")
          .select("*")
          .eq("card_key", job.card_key)
          .eq("orientation", job.orientation)
          .eq("is_active", true)
          .maybeSingle();

      if (orientationError) {
        return jsonUtf8(
          {
            ok: false,
            error: orientationError.message,
          },
          500
        );
      }

      if (!baseMeaning || !orientationMeaning) {
        await supabase
          .from("tarot_generation_jobs_prod")
          .update({
            status: "waiting_meaning",
            locked_at: null,
            error_message: "base_meaning または orientation_meaning 未登録",
            updated_at: new Date().toISOString(),
          })
          .eq("job_key", job.job_key);

        continue;
      }

      enrichedJobs.push({
        ...job,
        base_meaning: baseMeaning,
        orientation_meaning: orientationMeaning,
      });

      validJobKeys.push(job.job_key);

      if (enrichedJobs.length >= limit) {
        break;
      }
    }

    if (enrichedJobs.length === 0) {
      return jsonUtf8({
        ok: true,
        jobs: [],
        message: "No jobs with completed meanings",
      });
    }

    const { error: lockError } = await supabase
      .from("tarot_generation_jobs_prod")
      .update({
        status: "processing",
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("job_key", validJobKeys);

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