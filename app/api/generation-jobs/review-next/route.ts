import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");

    if (!batchKey) {
      return NextResponse.json(
        { error: "batch_key is required" },
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

    const { data: job, error } = await supabase
      .from("tarot_generation_jobs")
      .select(
        "job_key,card_name,orientation_name,category_name,topic_name,subtopic_name,timing_name,generated_text,status"
      )
      .eq("batch_key", batchKey)
      .eq("status", "generated")
      .order("generated_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!job) {
      return NextResponse.json({
        ok: true,
        has_job: false,
        message: "No generated jobs waiting for review",
      });
    }

    return NextResponse.json({
      ok: true,
      has_job: true,
      job_key: job.job_key,
      card_name: job.card_name,
      orientation_name: job.orientation_name,
      category_name: job.category_name,
      topic_name: job.topic_name,
      subtopic_name: job.subtopic_name,
      timing_name: job.timing_name,
      generated_text: job.generated_text,
      status: job.status,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}