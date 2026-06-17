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

function createReadingKey() {
  return `reading_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function randomOrientation() {
  return Math.random() < 0.5 ? "upright" : "reversed";
}

function isSupportedSpread(spreadKey: string, usageType: string) {
  return (
    (spreadKey === "three_card" && usageType === "default") ||
    (spreadKey === "celtic_cross" && usageType === "default") ||
    (spreadKey === "horoscope" && usageType === "default")
  );
}

async function findFromGenerationJobs(params: any) {
  const {
    supabase,
    categoryKey,
    topicKey,
    cardKey,
    orientation,
    spreadKey,
    positionNo,
  } = params;

  const { data, error } = await supabase
    .from("tarot_generation_jobs_prod")
    .select("generated_text")
    .eq("status", "approved")
    .eq("card_key", cardKey)
    .eq("orientation", orientation)
    .eq("category_key", categoryKey)
    .eq("topic_key", topicKey)
    .eq("spread_key", spreadKey)
    .eq("position_no", positionNo)
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log("GENERATION ERROR:", error);
  }

  return data?.generated_text ?? null;
}

async function findFromTopicFallback(params: any) {
  const { supabase, categoryKey, topicKey, cardKey, orientation } = params;

  const { data, error } = await supabase
    .from("tarot_generation_jobs_prod")
    .select("generated_text")
    .eq("status", "approved")
    .eq("card_key", cardKey)
    .eq("orientation", orientation)
    .eq("category_key", categoryKey)
    .eq("topic_key", topicKey)
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log("TOPIC FALLBACK ERROR:", error);
  }

  return data?.generated_text ?? null;
}

async function findFromDictionary(params: any) {
  const { supabase, cardKey, orientation, categoryKey } = params;

  const fieldMap: any = {
    love: "love_meaning",
    work: "work_meaning",
    money: "money_meaning",
    relationship: "relationship_meaning",
    human: "relationship_meaning",
    health: "health_meaning",
    yearly: "core_meaning",
  };

  const field = fieldMap[categoryKey] ?? "core_meaning";

  const { data, error } = await supabase
    .from("tarot_card_orientation_meanings_prod")
    .select(`core_meaning, ${field}`)
    .eq("card_key", cardKey)
    .eq("orientation", orientation)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log("DICTIONARY ERROR:", error);
  }

  if (!data) return null;

  return data[field] || data.core_meaning || null;
}

async function resolveInterpretation(params: any) {
  const g1 = await findFromGenerationJobs(params);
  if (g1) return g1;

  const g2 = await findFromTopicFallback(params);
  if (g2) return g2;

  const g3 = await findFromDictionary(params);
  if (g3) return g3;

  return "今の流れは変化の途中にあります。焦らず状況を整理することが重要です。";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const categoryKey = body?.category_key;
    const topicKey = body?.topic_key;
    const spreadKey = body?.spread_key;
    const usageType = body?.usage_type ?? "default";
    const questionText = body?.question_text ?? null;

    if (!categoryKey || !topicKey || !spreadKey) {
      return jsonUtf8(
        {
          ok: false,
          error: "category_key, topic_key, spread_key are required",
        },
        400
      );
    }

    if (!isSupportedSpread(spreadKey, usageType)) {
      return jsonUtf8(
        {
          ok: false,
          error:
            "create-from-jobs_v2 supports only three_card/default, celtic_cross/default, horoscope/default",
          spread_key: spreadKey,
          usage_type: usageType,
        },
        400
      );
    }

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

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const readingKey = createReadingKey();
    const now = new Date().toISOString();

    const { data: category, error: categoryError } = await supabase
      .from("tarot_categories_prod")
      .select("*")
      .eq("category_key", categoryKey)
      .limit(1)
      .maybeSingle();

    if (categoryError) {
      return jsonUtf8({ ok: false, error: categoryError.message }, 500);
    }

    if (!category) {
      return jsonUtf8({ ok: false, error: "category not found" }, 404);
    }

    const { data: topic, error: topicError } = await supabase
      .from("tarot_topics_prod")
      .select("*")
      .eq("topic_key", topicKey)
      .limit(1)
      .maybeSingle();

    if (topicError) {
      return jsonUtf8({ ok: false, error: topicError.message }, 500);
    }

    if (!topic) {
      return jsonUtf8({ ok: false, error: "topic not found" }, 404);
    }

    const { data: spread, error: spreadError } = await supabase
      .from("tarot_spreads_prod")
      .select("*")
      .eq("spread_key", spreadKey)
      .limit(1)
      .maybeSingle();

    if (spreadError) {
      return jsonUtf8({ ok: false, error: spreadError.message }, 500);
    }

    if (!spread) {
      return jsonUtf8({ ok: false, error: "spread not found" }, 404);
    }

    const { data: positions, error: positionsError } = await supabase
      .from("tarot_spread_positions_prod")
      .select("*")
      .eq("spread_key", spreadKey)
      .eq("usage_type", usageType)
      .order("position_no", { ascending: true });

    if (positionsError) {
      return jsonUtf8({ ok: false, error: positionsError.message }, 500);
    }

    const spreadPositions = positions ?? [];

    if (spreadPositions.length === 0) {
      return jsonUtf8(
        {
          ok: false,
          error: "spread positions not found",
          spread_key: spreadKey,
          usage_type: usageType,
        },
        404
      );
    }

    const expectedPositionCount =
      spreadKey === "three_card" ? 3 :
      spreadKey === "celtic_cross" ? 10 :
      spreadKey === "horoscope" ? 13 :
      spreadPositions.length;

    if (spreadPositions.length !== expectedPositionCount) {
      return jsonUtf8(
        {
          ok: false,
          error: "unexpected spread position count",
          spread_key: spreadKey,
          usage_type: usageType,
          expected_count: expectedPositionCount,
          actual_count: spreadPositions.length,
        },
        500
      );
    }

    const { data: cards, error: cardsError } = await supabase
      .from("tarot_cards_prod")
      .select("*")
      .eq("is_active", true);

    if (cardsError) {
      return jsonUtf8({ ok: false, error: cardsError.message }, 500);
    }

    const activeCards = cards ?? [];

    if (activeCards.length === 0) {
      return jsonUtf8({ ok: false, error: "active cards not found" }, 404);
    }

    const shuffled = [...activeCards].sort(() => Math.random() - 0.5);

    const { error: insertReadingError } = await supabase
      .from("tarot_readings_prod")
      .insert({
        reading_key: readingKey,
        category_key: category.category_key,
        category_name: category.category_name,
        topic_key: topic.topic_key,
        topic_name: topic.topic_name,
        spread_key: spread.spread_key,
        spread_name: spread.spread_name,
        usage_type: usageType,
        question_text: questionText,
        status: "created",
        created_at: now,
        updated_at: now,
      });

    if (insertReadingError) {
      return jsonUtf8({ ok: false, error: insertReadingError.message }, 500);
    }

    const readingCards = await Promise.all(
      spreadPositions.map(async (pos: any, i: number) => {
        const card = shuffled[i % shuffled.length];
        const orientation = randomOrientation();

        const interpretation = await resolveInterpretation({
          supabase,
          categoryKey: category.category_key,
          topicKey: topic.topic_key,
          cardKey: card.card_key,
          orientation,
          spreadKey: spread.spread_key,
          usageType,
          positionNo: pos.position_no,
        });

        return {
          reading_key: readingKey,

          position_no: pos.position_no,
          position_name: pos.position_name,
          position_description: pos.position_description,

          card_key: card.card_key,
          card_name: card.card_name,

          orientation,
          orientation_name: orientation === "upright" ? "正位置" : "逆位置",

          interpretation_text: interpretation,

          created_at: now,
          updated_at: now,
        };
      })
    );

    const { error: insertCardsError } = await supabase
      .from("tarot_reading_cards_prod")
      .insert(readingCards);

    if (insertCardsError) {
      return jsonUtf8({ ok: false, error: insertCardsError.message }, 500);
    }

    return jsonUtf8({
      ok: true,
      reading_key: readingKey,
      spread_key: spread.spread_key,
      usage_type: usageType,
      card_count: readingCards.length,
    });
  } catch (e: any) {
    console.log("FATAL ERROR:", e);
    return jsonUtf8(
      {
        ok: false,
        error: String(e),
      },
      500
    );
  }
}