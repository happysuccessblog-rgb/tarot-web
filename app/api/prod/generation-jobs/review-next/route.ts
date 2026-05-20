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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8(
        { ok: false, error: "Supabase environment variables are missing" },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("tarot_generation_jobs_prod")
      .select(`
        id,
        job_key,
        batch_key,
        card_key,
        card_name,
        orientation,
        orientation_name,
        category_key,
        category_name,
        topic_key,
        topic_name,
        subtopic_key,
        subtopic_name,
        timing_key,
        timing_name,
        generated_text,
        error_message
      `)
      .eq("status", "generated")
      .order("id", { ascending: true })
      .limit(1);

    if (batchKey) {
      query = query.eq("batch_key", batchKey);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return jsonUtf8({ ok: false, error: error.message }, 500);
    }

    if (!jobs || jobs.length === 0) {
      return jsonUtf8({
        ok: true,
        jobs: [],
        message: "No generated prod jobs for review",
      });
    }

    const job = jobs[0];

    const { data: baseMeaning, error: baseError } = await supabase
      .from("tarot_card_base_meanings_prod")
      .select(`
        card_key,
        card_name,
        core_keywords,
        core_meaning,
        love_meaning,
        work_meaning,
        money_meaning,
        relationship_meaning,
        health_meaning,
        spiritual_meaning,
        psychology,
        shadow_side,
        advice
      `)
      .eq("card_key", job.card_key)
      .eq("is_active", true)
      .maybeSingle();

    if (baseError) {
      return jsonUtf8({ ok: false, error: baseError.message }, 500);
    }

    const { data: orientationMeaning, error: orientationError } = await supabase
      .from("tarot_card_orientation_meanings_prod")
      .select(`
        card_key,
        orientation,
        orientation_name,
        keywords,
        core_meaning,
        love_meaning,
        work_meaning,
        money_meaning,
        relationship_meaning,
        health_meaning,
        spiritual_meaning,
        psychology,
        shadow_side,
        advice
      `)
      .eq("card_key", job.card_key)
      .eq("orientation", job.orientation)
      .eq("is_active", true)
      .maybeSingle();

    if (orientationError) {
      return jsonUtf8({ ok: false, error: orientationError.message }, 500);
    }

    return jsonUtf8({
      ok: true,
      jobs: [
        {
          ...job,
          base_meaning: baseMeaning,
          orientation_meaning: orientationMeaning,
        },
      ],
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}