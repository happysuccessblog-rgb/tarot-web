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
        topic_name,
        subtopic_name,
        timing_name,
        generated_text
      `)
      .eq("status", "generated")
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

    const { data: baseMeaning } = await supabase
      .from("tarot_card_base_meanings_prod")
      .select(`core_meaning, ${field}, psychology, advice`)
      .eq("card_key", job.card_key)
      .eq("is_active", true)
      .maybeSingle();

    const { data: orientationMeaning } = await supabase
      .from("tarot_card_orientation_meanings_prod")
      .select(`core_meaning, ${field}, psychology, shadow_side, advice`)
      .eq("card_key", job.card_key)
      .eq("orientation", job.orientation)
      .eq("is_active", true)
      .maybeSingle();

    return jsonUtf8({
      ok: true,
      jobs: [
        {
          ...job,
          review_basis: {
            base_core: baseMeaning?.core_meaning ?? "",
            base_category: baseMeaning?.[field] ?? "",
            base_psychology: baseMeaning?.psychology ?? "",
            base_advice: baseMeaning?.advice ?? "",
            orientation_core: orientationMeaning?.core_meaning ?? "",
            orientation_category: orientationMeaning?.[field] ?? "",
            orientation_psychology: orientationMeaning?.psychology ?? "",
            orientation_shadow: orientationMeaning?.shadow_side ?? "",
            orientation_advice: orientationMeaning?.advice ?? "",
          },
        },
      ],
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}