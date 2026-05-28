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

    const { searchParams } = new URL(request.url);
    const readingKey = searchParams.get("reading_key");

    if (!readingKey) {
      return jsonUtf8(
        {
          ok: false,
          error: "reading_key is required",
        },
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: reading, error: readingError } = await supabase
      .from("tarot_readings_prod")
      .select(
        `
        reading_key,
        category_key,
        topic_key,
        subtopic_key,
        spread_key,
        question_text,
        final_reading_text,
        status,
        created_at
      `
      )
      .eq("reading_key", readingKey)
      .maybeSingle();

    if (readingError) throw readingError;

    if (!reading) {
      return jsonUtf8(
        {
          ok: false,
          error: "reading not found",
        },
        404
      );
    }

    const { data: cards, error: cardsError } = await supabase
      .from("tarot_reading_cards_prod")
      .select(
        `
        position_no,
        position_name,
        card_key,
        card_name,
        orientation,
        orientation_name,
        interpretation_text,
        position_adjusted_text,
        combination_adjusted_text
      `
      )
      .eq("reading_key", readingKey)
      .order("position_no", { ascending: true });

    if (cardsError) throw cardsError;

    const cardKeys = [...new Set((cards ?? []).map((card) => card.card_key))];

    const { data: cardImages, error: cardImagesError } = await supabase
      .from("tarot_cards_prod")
      .select("card_key, image_url")
      .in("card_key", cardKeys);

    if (cardImagesError) throw cardImagesError;

    const imageMap = new Map(
      (cardImages ?? []).map((card) => [card.card_key, card.image_url])
    );

    const { data: categories } = await supabase
      .from("tarot_categories_prod")
      .select("category_key, category_name")
      .eq("category_key", reading.category_key)
      .maybeSingle();

    const { data: topics } = await supabase
      .from("tarot_topics_prod")
      .select("category_key, topic_key, topic_name")
      .eq("category_key", reading.category_key)
      .eq("topic_key", reading.topic_key)
      .maybeSingle();

    const { data: subtopics } = await supabase
      .from("tarot_subtopics_prod")
      .select("category_key, topic_key, subtopic_key, subtopic_name")
      .eq("category_key", reading.category_key)
      .eq("topic_key", reading.topic_key)
      .eq("subtopic_key", reading.subtopic_key)
      .maybeSingle();

    const { data: spread } = await supabase
      .from("tarot_spreads_prod")
      .select("spread_key, spread_name, card_count")
      .eq("spread_key", reading.spread_key)
      .maybeSingle();

    const cardsWithImages = (cards ?? []).map((card) => ({
      ...card,
      image_url: imageMap.get(card.card_key) ?? null,
    }));

    return jsonUtf8({
      ok: true,
      reading: {
        ...reading,
        category_name: categories?.category_name ?? reading.category_key,
        topic_name: topics?.topic_name ?? reading.topic_key,
        subtopic_name: subtopics?.subtopic_name ?? reading.subtopic_key,
        spread_name: spread?.spread_name ?? reading.spread_key,
        card_count: spread?.card_count ?? cardsWithImages.length,
      },
      cards: cardsWithImages,
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