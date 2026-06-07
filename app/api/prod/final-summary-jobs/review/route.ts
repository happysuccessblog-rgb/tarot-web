import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function json(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: "Missing Supabase env vars" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await request.json();

    const {
      job_key,
      generated_review_score,
      review_comment
    } = body;

    // --------------------------------------------------
    // ① validation
    // --------------------------------------------------
    if (!job_key) {
      return json({ ok: false, error: "job_key missing" }, 400);
    }

    // --------------------------------------------------
    // ② job取得
    // --------------------------------------------------
    const { data: job, error: fetchError } = await supabase
      .from("tarot_final_summary_jobs_prod")
      .select("*")
      .eq("job_key", job_key)
      .single();

    if (fetchError || !job) {
      return json(
        { ok: false, error: "Job not found", detail: fetchError },
        404
      );
    }

    const targetText = job.final_summary_text;

    if (!targetText) {
      return json(
        { ok: false, error: "No final_summary_text to review" },
        400
      );
    }

    // --------------------------------------------------
    // ③ スコア判定
    // --------------------------------------------------
    const score =
      generated_review_score ??
      Math.floor(Math.random() * 20) + 80;

    const isApproved = score >= 85;

    const now = new Date().toISOString();

    // --------------------------------------------------
    // ④ interpretation保存（履歴）
    // --------------------------------------------------
    const { data: inserted, error: insertError } = await supabase
      .from("tarot_final_summary_texts_prod")
      .insert({
        source_job_key: job.job_key,

        category_key: job.category_key,
        category_name: job.category_name,

        spread_key: job.spread_key,
        spread_name: job.spread_name,

        card_key: job.card_key,
        card_name: job.card_name,
        orientation: job.orientation,
        orientation_name: job.orientation_name,

        position_role: job.position_role,

        final_summary_text: targetText,

        generated_review_score: score,
        is_reviewed: true,
        is_approved: isApproved,

        approved_message: isApproved ? (review_comment ?? null) : null,

        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (insertError) {
      return json(
        { ok: false, error: "Insert failed", detail: insertError },
        500
      );
    }

    // --------------------------------------------------
    // ⑤ jobs更新（状態管理のみ）
    // --------------------------------------------------
    const jobUpdate: any = {
      status: isApproved ? "approved" : "reviewed",
      updated_at: now,
      reviewed_at: now
    };

    if (isApproved) {
      jobUpdate.approved_at = now;
    } else {
      jobUpdate.error_message = review_comment ?? null;
    }

    const { error: updateError } = await supabase
      .from("tarot_final_summary_jobs_prod")
      .update(jobUpdate)
      .eq("job_key", job_key);

    if (updateError) {
      return json(
        { ok: false, error: "Job update failed", detail: updateError },
        500
      );
    }

    // --------------------------------------------------
    // ⑥ response
    // --------------------------------------------------
    return json({
      ok: true,
      job_key,
      score,
      status: jobUpdate.status,
      approved: isApproved,
      inserted
    });

  } catch (err: any) {
    return json(
      { ok: false, error: err?.message ?? "Unknown error" },
      500
    );
  }
}