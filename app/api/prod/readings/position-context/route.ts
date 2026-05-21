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
    const readingKey = searchParams.get("reading_key");

    if (!readingKey) {
      return jsonUtf8(
        { ok: false, error: "reading_key is required" },
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

    const { data: reading, error: readingError } = await supabase
      .from("tarot_readings_prod")
      .select("*")
      .eq("reading_key", readingKey)
      .maybeSingle();

    if (readingError) {
      return jsonUtf8({ ok: false, error: readingError.message }, 500);
    }

    if (!reading) {
      return jsonUtf8(
        { ok: false, error: "reading not found" },
        404
      );
    }

    const { data: cards, error: cardsError } = await supabase
      .from("tarot_reading_cards_prod")
      .select("*")
      .eq("reading_key", readingKey)
      .order("position_no", { ascending: true });

    if (cardsError) {
      return jsonUtf8({ ok: false, error: cardsError.message }, 500);
    }

    const results = [];

    for (const card of cards ?? []) {
            const usageType = reading.usage_type ?? "default";

            let { data: adjustments, error: adjustmentError } = await supabase
              .from("tarot_spread_position_adjustments_prod")
              .select(`
                adjustment_role,
                adjustment_text
              `)
              .eq("spread_key", reading.spread_key)
              .eq("usage_type", usageType)
              .eq("position_no", card.position_no)
              .eq("category_key", reading.category_key)
              .eq("topic_key", reading.topic_key)
              .eq("subtopic_key", reading.subtopic_key)
              .eq("is_active", true);

            if (adjustmentError) {
              return jsonUtf8(
                { ok: false, error: adjustmentError.message },
                500
              );
            }

            if ((!adjustments || adjustments.length === 0) && usageType !== "default") {
              const fallback = await supabase
                .from("tarot_spread_position_adjustments_prod")
                .select(`
                  adjustment_role,
                  adjustment_text
                `)
                .eq("spread_key", reading.spread_key)
                .eq("usage_type", "default")
                .eq("position_no", card.position_no)
                .eq("category_key", reading.category_key)
                .eq("topic_key", reading.topic_key)
                .eq("subtopic_key", reading.subtopic_key)
                .eq("is_active", true);

              if (fallback.error) {
                return jsonUtf8(
                  { ok: false, error: fallback.error.message },
                  500
                );
              }

              adjustments = fallback.data ?? [];
            }

      results.push({
        position_no: card.position_no,
        position_name: card.position_name,

        card_key: card.card_key,
        card_name: card.card_name,

        orientation: card.orientation,
        orientation_name: card.orientation_name,

        interpretation_text: card.interpretation_text,

        adjustments: adjustments ?? [],
      });
    }

    return jsonUtf8({
      ok: true,

      reading: {
        reading_key: reading.reading_key,

        spread_key: reading.spread_key,
        spread_name: reading.spread_name,

        usage_type: reading.usage_type ?? "default",

        category_key: reading.category_key,
        category_name: reading.category_name,

        topic_key: reading.topic_key,
        topic_name: reading.topic_name,

        subtopic_key: reading.subtopic_key,
        subtopic_name: reading.subtopic_name,
      },

      cards: results,
    });
  } catch (error) {
    return jsonUtf8(
      { ok: false, error: String(error) },
      500
    );
  }
}