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

    // final_summaryも1件ずつ処理
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

    // --------------------------------------------------
    // ① final_summary専用ジョブ取得
    // --------------------------------------------------
    let query = supabase
      .from("tarot_final_summary_jobs_prod")
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
        message: "No pending final_summary jobs",
      });
    }

    const enrichedJobs = [];
    const validJobKeys: string[] = [];

    // --------------------------------------------------
    // ② meaning取得（final_summary用）
    //    ※ generationと同じテーブルを流用
    // --------------------------------------------------
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

      // --------------------------------------------------
      // ③ 必須チェック
      // --------------------------------------------------
      if (!baseMeaning || !orientationMeaning) {
        await supabase
          .from("tarot_final_summary_jobs_prod")
          .update({
            status: "waiting_meaning",
            locked_at: null,
            error_message:
              "base_meaning または orientation_meaning 未登録",
            updated_at: new Date().toISOString(),
          })
          .eq("job_key", job.job_key);

        continue;
      }

      // --------------------------------------------------
      // ④ job拡張
      // --------------------------------------------------
      enrichedJobs.push({
        ...job,
        base_meaning: baseMeaning,
        orientation_meaning: orientationMeaning,
      });

      validJobKeys.push(job.job_key);

      if (enrichedJobs.length >= limit) break;
    }

    if (enrichedJobs.length === 0) {
      return jsonUtf8({
        ok: true,
        jobs: [],
        message: "No final_summary jobs with meanings",
      });
    }

    // --------------------------------------------------
    // ⑤ ロック処理
    // --------------------------------------------------
    const { error: lockError } = await supabase
      .from("tarot_final_summary_jobs_prod")
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

    // --------------------------------------------------
    // ⑥ レスポンス
    // --------------------------------------------------
    return jsonUtf8({
      ok: true,
      jobs: enrichedJobs,
      job_type: "final_summary",
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