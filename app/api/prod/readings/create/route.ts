import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CreateReadingBody = {
  category_key?: string;
  topic_key?: string;
  subtopic_key?: string;
  spread_key?: string;
  question_text?: string;
  user_id?: string;
  session_id?: string;
};

function jsonUtf8(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function createReadingKey() {
  return `reading_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function randomOrientation() {
  return Math.random() < 0.5 ? "upright" : "reversed";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateReadingBody;

    if (!body.category_key) {
      return jsonUtf8({ ok: false, error: "category_key is required" }, 400);
    }

    if (!body.topic_key) {
      return jsonUtf8({ ok: false, error: "topic_key is required" }, 400);
    }

    if (!body.subtopic_key) {
      return jsonUtf8({ ok: false, error: "subtopic_key is required" }, 400);
    }

    if (!body.spread_key) {
      return jsonUtf8({ ok: false, error: "spread_key is required" }, 400);
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

    const { data: category, error: categoryError } = await supabase
      .from("tarot_categories_prod")
      .select("category_key, category_name")
      .eq("category_key", body.category_key)
      .eq("is_active", true)
      .maybeSingle();

    if (categoryError || !category) {
      return jsonUtf8(
        { ok: false, error: categoryError?.message ?? "category not found" },
        404
      );
    }

    const { data: topic, error: topicError } = await supabase
      .from("tarot_topics_prod")
      .select("topic_key, topic_name")
      .eq("category_key", body.category_key)
      .eq("topic_key", body.topic_key)
      .eq("is_active", true)
      .maybeSingle();

    if (topicError || !topic) {
      return jsonUtf8(
        { ok: false, error: topicError?.message ?? "topic not found" },
        404
      );
    }

    const { data: subtopic, error: subtopicError } = await supabase
      .from("tarot_subtopics_prod")
      .select("subtopic_key, subtopic_name")
      .eq("category_key", body.category_key)
      .eq("topic_key", body.topic_key)
      .eq("subtopic_key", body.subtopic_key)
      .eq("is_active", true)
      .maybeSingle();

    if (subtopicError || !subtopic) {
      return jsonUtf8(
        { ok: false, error: subtopicError?.message ?? "subtopic not found" },
        404
      );
    }

    const { data: spread, error: spreadError } = await supabase
      .from("tarot_spreads_prod")
      .select("spread_key, spread_name, card_count")
      .eq("spread_key", body.spread_key)
      .eq("is_active", true)
      .maybeSingle();

    if (spreadError || !spread) {
      return jsonUtf8(
        { ok: false, error: spreadError?.message ?? "spread not found" },
        404
      );
    }

    const { data: positions, error: positionsError } = await supabase
      .from("tarot_spread_positions_prod")
      .select("position_no, position_name, position_description")
      .eq("spread_key", body.spread_key)
      .eq("is_active", true)
      .order("position_no", { ascending: true });

    if (positionsError || !positions || positions.length !== spread.card_count) {
      return jsonUtf8(
        {
          ok: false,
          error:
            positionsError?.message ??
            "spread positions count does not match card_count",
        },
        500
      );
    }

    const { data: cards, error: cardsError } = await supabase
      .from("tarot_cards_prod")
      .select("card_key, card_name")
      .eq("is_active", true);

    if (cardsError || !cards || cards.length < spread.card_count) {
      return jsonUtf8(
        {
          ok: false,
          error: cardsError?.message ?? "not enough active cards",
        },
        500
      );
    }

    const shuffledCards = [...cards].sort(() => Math.random() - 0.5);
    const selectedCards = shuffledCards.slice(0, spread.card_count);

    const readingKey = createReadingKey();
    const now = new Date().toISOString();

    const { error: readingInsertError } = await supabase
      .from("tarot_readings_prod")
      .insert({
        reading_key: readingKey,

        user_id: body.user_id ?? null,
        session_id: body.session_id ?? null,

        category_key: category.category_key,
        category_name: category.category_name,

        topic_key: topic.topic_key,
        topic_name: topic.topic_name,

        subtopic_key: subtopic.subtopic_key,
        subtopic_name: subtopic.subtopic_name,

        spread_key: spread.spread_key,
        spread_name: spread.spread_name,

        question_text: body.question_text ?? "",

        status: "created",
        created_at: now,
        updated_at: now,
      });

    if (readingInsertError) {
      return jsonUtf8({ ok: false, error: readingInsertError.message }, 500);
    }

    const readingCards = positions.map((position, index) => {
      const card = selectedCards[index];
      const orientation = randomOrientation();

      return {
        reading_key: readingKey,

        position_no: position.position_no,
        position_name: position.position_name,
        position_description: position.position_description,

        card_key: card.card_key,
        card_name: card.card_name,

        orientation,
        orientation_name: orientation === "upright" ? "正位置" : "逆位置",

        created_at: now,
        updated_at: now,
      };
    });

    const { error: cardsInsertError } = await supabase
      .from("tarot_reading_cards_prod")
      .insert(readingCards);

    if (cardsInsertError) {
      return jsonUtf8({ ok: false, error: cardsInsertError.message }, 500);
    }

    return jsonUtf8({
      ok: true,
      reading_key: readingKey,
      spread_key: spread.spread_key,
      spread_name: spread.spread_name,
      card_count: spread.card_count,
      cards: readingCards,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}