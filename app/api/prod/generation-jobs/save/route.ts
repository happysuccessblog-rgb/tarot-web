import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SaveProdGenerationJobBody = {
  job_key?: string;
  output_text?: string;
  prompt_used?: string;
  model_name?: string;
  generation_note?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveProdGenerationJobBody;

    if (!body.job_key) {
      return NextResponse.json(
        { ok: false, error: "job_key is required" },
        { status: 400 }
      );
    }

    if (!body.output_text) {
      return NextResponse.json(
        { ok: false, error: "output_text is required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: job, error: jobError } = await supabase
      .from("tarot_generation_jobs_prod")
      .select("*")
      .eq("job_key", body.job_key)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: jobError?.message ?? "job not found" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    const { error: applyError } = await supabase
      .from("tarot_interpretation_texts_prod")
      .upsert(
        {
          card_key: job.card_key,
          card_name: job.card_name,

          orientation: job.orientation,
          orientation_name: job.orientation_name,

          category_key: job.category_key,
          category_name: job.category_name,

          topic_key: job.topic_key,
          topic_name: job.topic_name,

          subtopic_key: job.subtopic_key,
          subtopic_name: job.subtopic_name,

          timing_key: job.timing_key,
          timing_name: job.timing_name,

          text_role: job.text_role ?? "main",
          length_type: job.length_type ?? "normal",
          tone_type: job.tone_type ?? "soft",

          interpretation_text: body.output_text,

          is_reviewed: false,
          is_approved: false,

          source_job_key: job.job_key,
          updated_at: now,
        },
        {
          onConflict:
            "card_key,orientation,category_key,topic_key,subtopic_key,timing_key,text_role,length_type,tone_type",
        }
      );

    if (applyError) {
      return NextResponse.json(
        { ok: false, error: applyError.message },
        { status: 500 }
      );
    }

    const { error: updateJobError } = await supabase
      .from("tarot_generation_jobs_prod")
      .update({
        status: "generated",
        generated_text: body.output_text,
        generated_at: now,
        updated_at: now,
        error_message: "",
      })
      .eq("job_key", job.job_key);

    if (updateJobError) {
      return NextResponse.json(
        { ok: false, error: updateJobError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      job_key: job.job_key,
      status: "generated",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}