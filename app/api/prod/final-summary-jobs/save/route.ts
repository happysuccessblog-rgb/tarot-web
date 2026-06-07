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
      final_summary_text
    } = body;

    // --------------------------------------------------
    // ① validation
    // --------------------------------------------------
    if (!job_key || !final_summary_text) {
      return json(
        { ok: false, error: "job_key or final_summary_text missing" },
        400
      );
    }

    // --------------------------------------------------
    // ② job取得（存在確認のみ）
    // --------------------------------------------------
    const { data: job, error: fetchError } = await supabase
      .from("tarot_final_summary_jobs_prod")
      .select("job_key")
      .eq("job_key", job_key)
      .single();

    if (fetchError || !job) {
      return json(
        { ok: false, error: "Job not found", detail: fetchError },
        404
      );
    }

    const now = new Date().toISOString();

    // --------------------------------------------------
    // ③ update payload
    // --------------------------------------------------
    const updatePayload: any = {
      final_summary_text,
      status: "generated",
      generated_at: now,
      updated_at: now
    };

    // --------------------------------------------------
    // ④ DB更新
    // --------------------------------------------------
    const { data: updated, error: updateError } = await supabase
      .from("tarot_final_summary_jobs_prod")
      .update(updatePayload)
      .eq("job_key", job_key)
      .select()
      .single();

    if (updateError) {
      return json(
        { ok: false, error: "Update failed", detail: updateError },
        500
      );
    }

    // --------------------------------------------------
    // ⑤ response
    // --------------------------------------------------
    return json({
      ok: true,
      job_key,
      saved: true,
      data: updated
    });

  } catch (err: any) {
    return json(
      { ok: false, error: err?.message ?? "Unknown error" },
      500
    );
  }
}