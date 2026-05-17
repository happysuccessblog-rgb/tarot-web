import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SaveGenerationJobBody = {
  job_key?: string;
  output_text?: string;
  prompt_used?: string;
  model_name?: string;
  generation_note?: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get("x-api-key");

    if (apiKey !== process.env.SAVE_READING_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as SaveGenerationJobBody;

    if (!body.job_key) {
      return NextResponse.json(
        { error: "job_key is required" },
        { status: 400 }
      );
    }

    if (!body.output_text) {
      return NextResponse.json(
        { error: "output_text is required" },
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

    const { data: job, error: jobError } = await supabase
      .from("tarot_generation_jobs")
      .select("*")
      .eq("job_key", body.job_key)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message ?? "job not found" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    const { error: outputError } = await supabase
      .from("tarot_generation_outputs")
      .insert({
        job_key: job.job_key,
        batch_key: job.batch_key,
        target_table: job.target_table,
        output_text: body.output_text,
        prompt_used: body.prompt_used ?? "",
        model_name: body.model_name ?? "gpts",
        generation_note: body.generation_note ?? "",
        is_selected: true,
        is_applied: true,
        created_at: now,
      });

    if (outputError) {
      return NextResponse.json(
        { error: outputError.message },
        { status: 500 }
      );
    }

    if (job.target_table === "tarot_interpretation_texts") {
      const { error: applyError } = await supabase
        .from("tarot_interpretation_texts")
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

            interpretation_text: body.output_text,

            is_active: true,
            updated_at: now,
          },
          {
            onConflict:
              "card_key,orientation,category_key,topic_key,subtopic_key,timing_key,text_role,length_type",
          }
        );

      if (applyError) {
        return NextResponse.json(
          { error: applyError.message },
          { status: 500 }
        );
      }
    }

    const { error: updateJobError } = await supabase
      .from("tarot_generation_jobs")
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
        { error: updateJobError.message },
        { status: 500 }
      );
    }

    await supabase
      .from("tarot_generation_batches")
      .update({
        completed_jobs: 0,
        error_jobs: 0,
        updated_at: now,
      })
      .eq("batch_key", job.batch_key);

    const { count: completedCount } = await supabase
      .from("tarot_generation_jobs")
      .select("*", { count: "exact", head: true })
      .eq("batch_key", job.batch_key)
      .in("status", ["generated", "reviewed", "approved"]);

    const { count: errorCount } = await supabase
      .from("tarot_generation_jobs")
      .select("*", { count: "exact", head: true })
      .eq("batch_key", job.batch_key)
      .eq("status", "error");

    await supabase
      .from("tarot_generation_batches")
      .update({
        completed_jobs: completedCount ?? 0,
        error_jobs: errorCount ?? 0,
        updated_at: now,
      })
      .eq("batch_key", job.batch_key);

    return NextResponse.json({
      ok: true,
      job_key: job.job_key,
      status: "generated",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}