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

// --------------------------------------------------
// ① generation_jobs
// --------------------------------------------------
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
    .maybeSingle();

  if (error) {
    console.log("GENERATION ERROR:", error);
  }

  return data?.generated_text ?? null;
}

// --------------------------------------------------
// ② topic fallback（spread除外）
// --------------------------------------------------
async function findFromTopicFallback(params: any) {
  const {
    supabase,
    categoryKey,
    topicKey,
    cardKey,
    orientation,
    positionNo,
  } = params;

  const { data } = await supabase
    .from("tarot_generation_jobs_prod")
    .select("generated_text")
    .eq("status", "approved")
    .eq("card_key", cardKey)
    .eq("orientation", orientation)
    .eq("category_key", categoryKey)
    .eq("topic_key", topicKey)
    .maybeSingle();

  return data?.generated_text ?? null;
}

// --------------------------------------------------
// ④ 最終辞書（100%保証）
// --------------------------------------------------
async function findFromDictionary(params: any) {
  const { supabase, cardKey, orientation, categoryKey } = params;

  const fieldMap: any = {
    love: "love_meaning",
    work: "work_meaning",
    money: "money_meaning",
    relationship: "relationship_meaning",
    health: "health_meaning",
  };

  const field = fieldMap[categoryKey] ?? "core_meaning";

  const { data } = await supabase
    .from("tarot_card_orientation_meanings_prod")
    .select(`core_meaning, ${field}`)
    .eq("card_key", cardKey)
    .eq("orientation", orientation)
    .maybeSingle();

  if (!data) return null;

  return data[field] || data.core_meaning || null;
}

// --------------------------------------------------
// unified resolver
// --------------------------------------------------
async function resolveInterpretation(params: any) {
  // ① generation_jobs
  const g1 = await findFromGenerationJobs(params);
  if (g1) return g1;

  // ② topic fallback
  const g2 = await findFromTopicFallback(params);
  if (g2) return g2;

  // ④ dictionary fallback（最終保証）
  const g3 = await findFromDictionary(params);
  if (g3) return g3;

  // 100%保証（絶対落ちない）
  return "今の流れは変化の途中にあります。焦らず状況を整理することが重要です。";
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const readingKey = createReadingKey();
    const now = new Date().toISOString();

    // --------------------------------------------------
    // master
    // --------------------------------------------------
    const { data: category } = await supabase
      .from("tarot_categories_prod")
      .select("*")
      .eq("category_key", body.category_key)
      .single();

    const { data: topic } = await supabase
      .from("tarot_topics_prod")
      .select("*")
      .eq("topic_key", body.topic_key)
      .single();

    const { data: spread } = await supabase
      .from("tarot_spreads_prod")
      .select("*")
      .eq("spread_key", body.spread_key)
      .single();

    // --------------------------------------------------
    // positions
    // --------------------------------------------------
    const { data: positions } = await supabase
      .from("tarot_spread_positions_prod")
      .select("*")
      .eq("spread_key", body.spread_key)
      .order("position_no");

    // --------------------------------------------------
    // cards
    // --------------------------------------------------
    const { data: cards } = await supabase
      .from("tarot_cards_prod")
      .select("*")
      .eq("is_active", true);

    const shuffled = [...(cards ?? [])].sort(() => Math.random() - 0.5);

    // --------------------------------------------------
    // reading header
    // --------------------------------------------------
    await supabase.from("tarot_readings_prod").insert({
      reading_key: readingKey,
      category_key: category.category_key,
      category_name: category.category_name,
      topic_key: topic.topic_key,
      topic_name: topic.topic_name,
      spread_key: spread.spread_key,
      spread_name: spread.spread_name,
      question_text: body.question_text ?? null,
      status: "created",
      created_at: now,
      updated_at: now,
    });

    // --------------------------------------------------
    // cards
    // --------------------------------------------------
    const readingCards = await Promise.all(
      positions.map(async (pos, i) => {
        const card = shuffled[i % shuffled.length];
        const orientation = randomOrientation();

        const interpretation = await resolveInterpretation({
          supabase,
          categoryKey: category.category_key,
          topicKey: topic.topic_key,
          cardKey: card.card_key,
          orientation,
          spreadKey: spread.spread_key,
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

    await supabase
      .from("tarot_reading_cards_prod")
      .insert(readingCards);

    return jsonUtf8({
      ok: true,
      reading_key: readingKey,
      card_count: readingCards.length,
    });

  } catch (e: any) {
    console.log("FATAL ERROR:", e);
    return jsonUtf8({
      ok: false,
      error: String(e),
    }, 500);
  }
}