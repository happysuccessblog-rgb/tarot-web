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
        { ok: false, error: "Supabase env missing" },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // --------------------------------------------------
    // ① final_summaryジョブ取得（レビュー対象）
    // --------------------------------------------------
    const { data: job, error: jobError } = await supabase
      .from("tarot_final_summary_jobs_prod")
      .select(`
        id,
        job_key,

        card_key,
        card_name,
        orientation,
        orientation_name,

        category_key,
        category_name,

        spread_key,
        spread_name,

        position_role,

        final_summary_text
      `)
      .eq("status", "generated")
      .order("priority", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobError) {
      return jsonUtf8(
        { ok: false, error: jobError.message },
        500
      );
    }

    if (!job) {
      return jsonUtf8({
        ok: true,
        jobs: [],
        message: "No final_summary jobs for review",
      });
    }

    // --------------------------------------------------
    // ② レビュー基準データ取得（共通マスタ流用）
    // --------------------------------------------------
    const { data: baseMeaning, error: baseError } = await supabase
      .from("tarot_card_base_meanings_prod")
      .select("*")
      .eq("card_key", job.card_key)
      .eq("is_active", true)
      .maybeSingle();

    if (baseError) {
      return jsonUtf8(
        { ok: false, error: baseError.message },
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
        { ok: false, error: orientationError.message },
        500
      );
    }

    // --------------------------------------------------
    // ③ レスポンス整形（final_summary用）
    // --------------------------------------------------
    return jsonUtf8({
      ok: true,
      jobs: [
        {
          id: job.id,
          job_key: job.job_key,

          card_name: job.card_name,
          orientation_name: job.orientation_name,

          category_key: job.category_key,
          category_name: job.category_name,

          spread_key: job.spread_key,
          spread_name: job.spread_name,

          position_role: job.position_role,

          final_summary_text: job.final_summary_text,

          review_basis: {
            base_meaning: baseMeaning ?? {},
            orientation_meaning: orientationMeaning ?? {}
          }
        }
      ]
    });

  } catch (error) {
    return jsonUtf8(
      { ok: false, error: String(error) },
      500
    );
  }
}