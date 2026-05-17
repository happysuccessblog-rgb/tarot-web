import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReviewGenerationJobBody = {
  job_key?: string;
  action?: "approved" | "reviewed" | "regenerate" | "skipped";
  review_note?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewGenerationJobBody;

    if (!body.job_key) {
      return NextResponse.json(
        { error: "job_key is required" },
        { status: 400 }
      );
    }

    if (!body.action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date().toISOString();

    let nextStatus: string = body.action;

    if (body.action === "regenerate") {
      nextStatus = "pending";
    }

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: now,
      error_message: body.review_note ?? "",
    };

    if (body.action === "approved") {
      updatePayload.approved_at = now;
      updatePayload.reviewed_at = now;
    }

    if (body.action === "reviewed") {
      updatePayload.reviewed_at = now;
    }

    if (body.action === "regenerate") {
      updatePayload.generated_text = "";
      updatePayload.generated_at = null;
      updatePayload.locked_at = null;
    }

    const { data, error } = await supabase
      .from("tarot_generation_jobs")
      .update(updatePayload)
      .eq("job_key", body.job_key)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      job_key: body.job_key,
      status: data.status,
      action: body.action,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}