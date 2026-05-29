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

function categoryField(categoryKey: string | null) {
  if (categoryKey === "love") return "love_meaning";
  if (categoryKey === "work") return "work_meaning";
  if (categoryKey === "money") return "money_meaning";
  if (categoryKey === "relationship") return "relationship_meaning";
  if (categoryKey === "health") return "health_meaning";
  return "core_meaning";
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8({ ok: false, error: "Supabase env missing" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: job, error: jobError } = await supabase
      .from("tarot_generation_jobs_prod")
      .select(`
        id,
        job_key,

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

        spread_key,
        spread_name,

        position_no,
        position_name,
        position_description,

        text_role,

        generated_text
      `)
      .eq("status", "generated")
      .order("priority", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobError) {
      return jsonUtf8({ ok: false, error: jobError.message }, 500);
    }

    if (!job) {
      return jsonUtf8({
        ok: true,
        jobs: [],
        message: "No generated prod jobs for review",
      });
    }

    const field = categoryField(job.category_key);

    const { data: baseMeaning, error: baseError } = await supabase
      .from("tarot_card_base_meanings_prod")
      .select(`core_meaning, ${field}`)
      .eq("card_key", job.card_key)
      .eq("is_active", true)
      .maybeSingle();

    if (baseError) {
      return jsonUtf8({ ok: false, error: baseError.message }, 500);
    }

    const { data: orientationMeaning, error: orientationError } = await supabase
      .from("tarot_card_orientation_meanings_prod")
      .select(`core_meaning, ${field}, shadow_side`)
      .eq("card_key", job.card_key)
      .eq("orientation", job.orientation)
      .eq("is_active", true)
      .maybeSingle();

    if (orientationError) {
      return jsonUtf8({ ok: false, error: orientationError.message }, 500);
    }

    const baseAny = baseMeaning as any;
    const orientationAny = orientationMeaning as any;

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

          topic_key: job.topic_key,
          topic_name: job.topic_name,

          subtopic_key: job.subtopic_key,
          subtopic_name: job.subtopic_name,

          timing_key: job.timing_key,
          timing_name: job.timing_name,

          spread_key: job.spread_key,
          spread_name: job.spread_name,

          position_no: job.position_no,
          position_name: job.position_name,
          position_description: job.position_description,

          text_role: job.text_role,

          generated_text: job.generated_text,

          review_basis: {
            base_core: baseAny?.core_meaning ?? "",
            base_category: baseAny?.[field] ?? "",
            orientation_core: orientationAny?.core_meaning ?? "",
            orientation_category: orientationAny?.[field] ?? "",
            orientation_shadow: orientationAny?.shadow_side ?? "",
          },
        },
      ],
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}