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
      return jsonUtf8({ ok: false, error: "reading_key is required" }, 400);
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
      return jsonUtf8({ ok: false, error: "reading not found" }, 404);
    }

    const { data: cards, error: cardsError } = await supabase
      .from("tarot_reading_cards_prod")
      .select("*")
      .eq("reading_key", readingKey)
      .order("position_no", { ascending: true });

    if (cardsError) {
      return jsonUtf8({ ok: false, error: cardsError.message }, 500);
    }

    const { data: storyPatterns, error: storyError } = await supabase
      .from("tarot_spread_story_patterns_prod")
      .select(`
        pattern_key,
        pattern_name,
        pattern_keywords,
        opening_text,
        middle_text,
        closing_text,
        summary_text,
        advice_text,
        emotional_tone,
        score_min,
        score_max
      `)
      .eq("spread_key", reading.spread_key)
      .eq("category_key", reading.category_key)
      .eq("topic_key", reading.topic_key)
      .eq("subtopic_key", reading.subtopic_key)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (storyError) {
      return jsonUtf8({ ok: false, error: storyError.message }, 500);
    }

    const pairContexts = [];

    const readingCards = cards ?? [];

    for (let i = 0; i < readingCards.length - 1; i++) {
      const first = readingCards[i];
      const second = readingCards[i + 1];

      const { data: pairMeaning, error: pairError } = await supabase
        .from("tarot_card_pair_meanings_prod")
        .select(`
          pair_keywords,
          pair_meaning_short,
          pair_meaning_long,
          synergy_score
        `)
        .eq("card_key_1", first.card_key)
        .eq("orientation_1", first.orientation)
        .eq("card_key_2", second.card_key)
        .eq("orientation_2", second.orientation)
        .eq("category_key", reading.category_key)
        .eq("topic_key", reading.topic_key)
        .eq("subtopic_key", reading.subtopic_key)
        .eq("is_active", true)
        .maybeSingle();

      if (pairError) {
        return jsonUtf8({ ok: false, error: pairError.message }, 500);
      }

      pairContexts.push({
        from_position_no: first.position_no,
        from_position_name: first.position_name,
        from_card_name: first.card_name,
        from_orientation_name: first.orientation_name,

        to_position_no: second.position_no,
        to_position_name: second.position_name,
        to_card_name: second.card_name,
        to_orientation_name: second.orientation_name,

        pair_meaning: pairMeaning ?? null,
      });
    }

    return jsonUtf8({
      ok: true,
      reading: {
        reading_key: reading.reading_key,
        category_name: reading.category_name,
        topic_name: reading.topic_name,
        subtopic_name: reading.subtopic_name,
        spread_name: reading.spread_name,
        question_text: reading.question_text,
      },
      cards: readingCards.map((card) => ({
        position_no: card.position_no,
        position_name: card.position_name,
        card_name: card.card_name,
        orientation_name: card.orientation_name,
        interpretation_text: card.interpretation_text,
        position_adjusted_text: card.position_adjusted_text,
      })),
      pair_contexts: pairContexts,
      story_patterns: storyPatterns ?? [],
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}