import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReviewAction = "approved" | "regenerate" | "reviewed";

type ReviewProdGenerationJobBody = {
  job_key?: string;
  action?: ReviewAction;
  review_note?: string;
  quality_score?: number;
};

function jsonUtf8(data: unknown, status = 200) {
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
    const body = (await request.json()) as ReviewProdGenerationJobBody;

    if (!body.job_key) {
      return jsonUtf8({ ok: false, error: "job_key is required" }, 400);
    }

    if (
      !body.action ||
      !["approved", "regenerate", "reviewed"].includes(body.action)
    ) {
      return jsonUtf8(
        { ok: false, error: "action must be approved, regenerate, or reviewed" },
        400
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8(
        { ok: false, error: "Supabase environment variables are missing" },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date().toISOString();

    const { data: job, error: jobError } = await supabase
      .from("tarot_generation_jobs_prod")
      .select("*")
      .eq("job_key", body.job_key)
      .single();

    if (jobError || !job) {
      return jsonUtf8(
        { ok: false, error: jobError?.message ?? "job not found" },
        404
      );
    }

    const defaultReviewNote =
      body.action === "approved"
        ? "自然な文章量でテーマに一致。カードの意味と正逆も反映されているため承認。"
        : body.action === "reviewed"
          ? "大きな問題はないが、手動微調整の余地あり。"
          : "再生成が必要。";

    const reviewNote = body.review_note?.trim()
      ? body.review_note
      : defaultReviewNote;

    let nextStatus: ReviewAction | "pending" = body.action;

    if (body.action === "regenerate") {
      nextStatus = "pending";
    }

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      reviewed_at: now,
      updated_at: now,
      error_message: reviewNote,
    };

    if (body.action === "approved") {
      updatePayload.approved_at = now;
    }

    if (body.action === "regenerate") {
      updatePayload.generated_at = null;
      updatePayload.locked_at = null;
    }

    const { error: updateJobError } = await supabase
      .from("tarot_generation_jobs_prod")
      .update(updatePayload)
      .eq("job_key", job.job_key);

    if (updateJobError) {
      return jsonUtf8({ ok: false, error: updateJobError.message }, 500);
    }

    const interpretationUpdate: Record<string, unknown> = {
      is_reviewed: true,
      is_approved: body.action === "approved",
      updated_at: now,
    };

    if (typeof body.quality_score === "number") {
      interpretationUpdate.quality_score = body.quality_score;
    }

    const { error: updateTextError } = await supabase
      .from("tarot_interpretation_texts_prod")
      .update(interpretationUpdate)
      .eq("source_job_key", job.job_key);

    if (updateTextError) {
      return jsonUtf8({ ok: false, error: updateTextError.message }, 500);
    }

    return jsonUtf8({
      ok: true,
      job_key: job.job_key,
      action: body.action,
      status: nextStatus,
      review_note: reviewNote,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}