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
      generated_review_score
    } = body;

    // --------------------------------------------------
    // ① 必須チェック
    // --------------------------------------------------
    if (!job_key) {
      return json({ ok: false, error: "job_key missing" }, 400);
    }

    // --------------------------------------------------
    // ② ジョブ取得
    // --------------------------------------------------
    const { data: job, error: fetchError } = await supabase
      .from("tarot_generation_jobs_prod")
      .select("*")
      .eq("job_key", job_key)
      .single();

    if (fetchError || !job) {
      return json({ ok: false, error: "Job not found", detail: fetchError }, 404);
    }

    // --------------------------------------------------
    // ③ 対象テキスト
    // --------------------------------------------------
    const targetText = job.generated_text;

    if (!targetText) {
      return json({ ok: false, error: "No generated_text to review" }, 400);
    }

    // --------------------------------------------------
    // ④ スコア決定
    // --------------------------------------------------
    const score =
      generated_review_score ??
      Math.floor(Math.random() * 20) + 80;

    const isApproved = score >= 85;

    // --------------------------------------------------
    // ⑤ interpretation保存
    // --------------------------------------------------
    const { data: inserted, error: insertError } = await supabase
      .from("tarot_interpretation_texts_prod")
      .insert({
        source_job_key: job.job_key,
        output_type: "generated",
        interpretation_text: targetText,
        generated_review_score: score,
        is_reviewed: true,
        is_approved: isApproved,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return json({ ok: false, error: "Insert failed", detail: insertError }, 500);
    }

    // --------------------------------------------------
    // ⑥ jobs更新（最小構成のみ）
    // --------------------------------------------------
    const { error: updateError } = await supabase
      .from("tarot_generation_jobs_prod")
      .update({
        status: isApproved ? "approved" : "reviewed",
        updated_at: new Date().toISOString(),
      })
      .eq("job_key", job_key);

    if (updateError) {
      return json({ ok: false, error: "Job update failed", detail: updateError }, 500);
    }

    // --------------------------------------------------
    // ⑦ レスポンス
    // --------------------------------------------------
    return json({
      ok: true,
      job_key,
      score,
      status: isApproved ? "approved" : "reviewed",
      inserted
    });

  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? "Unknown error" }, 500);
  }
}