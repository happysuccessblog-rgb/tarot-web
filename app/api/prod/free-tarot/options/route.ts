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

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8(
        {
          ok: false,
          error: "Supabase environment variables are missing",
        },
        500
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const [
      categoryResult,
      topicResult,
      subtopicResult,
      spreadResult,
    ] = await Promise.all([
      supabase
        .from("tarot_categories_prod")
        .select("category_key, category_name")
        .eq("is_active", true)
        .order("category_key", { ascending: true }),

      supabase
        .from("tarot_topics_prod")
        .select("category_key, topic_key, topic_name")
        .eq("is_active", true)
        .order("topic_key", { ascending: true }),

      supabase
        .from("tarot_subtopics_prod")
        .select(
          "category_key, topic_key, subtopic_key, subtopic_name"
        )
        .eq("is_active", true)
        .order("subtopic_key", { ascending: true }),

      supabase
        .from("tarot_spreads_prod")
        .select("spread_key, spread_name, card_count")
        .eq("is_active", true)
        .order("card_count", { ascending: true }),
    ]);

    if (categoryResult.error) throw categoryResult.error;
    if (topicResult.error) throw topicResult.error;
    if (subtopicResult.error) throw subtopicResult.error;
    if (spreadResult.error) throw spreadResult.error;

    return jsonUtf8({
      ok: true,
      categories: categoryResult.data ?? [],
      topics: topicResult.data ?? [],
      subtopics: subtopicResult.data ?? [],
      spreads: spreadResult.data ?? [],
    });
  } catch (error) {
    return jsonUtf8(
      {
        ok: false,
        error: String(error),
      },
      500
    );
  }
}