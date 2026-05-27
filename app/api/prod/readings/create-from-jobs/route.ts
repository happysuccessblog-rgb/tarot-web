import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CreateReadingFromJobsBody = {
  category_key?: string;
  topic_key?: string;
  subtopic_key?: string;
  spread_key?: string;
  usage_type?: string;
  question_text?: string;
  user_id?: string;
  session_id?: string;
  length_type?: string;
  tone_type?: string;
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

function resolveTimingKey(positionName: string) {
  if (positionName.includes("過去")) return "past";
  if (positionName.includes("近未来")) return "future";
  if (positionName.includes("未来")) return "future";
  if (positionName.includes("最終")) return "future";
  if (positionName.includes("結果")) return "future";
  if (positionName.includes("現在")) return "present";
  if (positionName.includes("現状")) return "present";
  if (positionName.includes("潜在")) return "hidden";
  if (positionName.includes("本音")) return "hidden";
  if (positionName.includes("障害")) return "present";
  if (positionName.includes("問題")) return "present";
  if (positionName.includes("アドバイス")) return "advice";
  if (positionName.includes("助言")) return "advice";
  if (positionName.includes("Yes")) return "present";
  if (positionName.includes("No")) return "present";
  if (positionName.includes("選択肢A")) return "present";
  if (positionName.includes("選択肢B")) return "present";
  if (positionName.includes("Aを選んだ場合")) return "present";
  if (positionName.includes("Bを選んだ場合")) return "present";

  return "present";
}

function getCategoryMeaningColumn(categoryKey: string) {
  switch (categoryKey) {
    case "love":
      return "love_meaning";
    case "work":
      return "work_meaning";
    case "money":
      return "money_meaning";
    case "relationship":
      return "relationship_meaning";
    case "health":
      return "health_meaning";
    case "spiritual":
      return "spiritual_meaning";
    default:
      return "core_meaning";
  }
}

async function findGeneratedTextFromJobs(params: {
  supabase: any;
  categoryKey: string;
  topicKey: string;
  subtopicKey: string;
  timingKey: string;
  cardKey: string;
  orientation: string;
  lengthType: string;
  toneType: string;
}) {
  const {
    supabase,
    categoryKey,
    topicKey,
    subtopicKey,
    timingKey,
    cardKey,
    orientation,
    lengthType,
    toneType,
  } = params;

  async function runJobs(query: any) {
    const result = await query
      .eq("status", "approved")
      .eq("card_key", cardKey)
      .eq("orientation", orientation)
      .eq("length_type", lengthType)
      .eq("tone_type", toneType)
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);
    return result.data ?? null;
  }

  const jobsBase = () =>
    supabase
      .from("tarot_generation_jobs_prod")
      .select(
        "generated_text, job_key, category_key, topic_key, subtopic_key, timing_key"
      );

  const jobCandidates = [
    () =>
      runJobs(
        jobsBase()
          .eq("category_key", categoryKey)
          .eq("topic_key", topicKey)
          .eq("subtopic_key", subtopicKey)
          .eq("timing_key", timingKey)
      ),

    () =>
      runJobs(
        jobsBase()
          .eq("category_key", categoryKey)
          .eq("topic_key", topicKey)
          .eq("subtopic_key", subtopicKey)
          .eq("timing_key", "present")
      ),

    () =>
      runJobs(
        jobsBase()
          .eq("category_key", categoryKey)
          .eq("topic_key", topicKey)
          .eq("subtopic_key", subtopicKey)
          .eq("timing_key", "future")
      ),

    () =>
      runJobs(
        jobsBase()
          .eq("category_key", categoryKey)
          .eq("topic_key", topicKey)
          .eq("subtopic_key", subtopicKey)
          .eq("timing_key", "result")
      ),
  ];

  for (const candidate of jobCandidates) {
    const data = await candidate();

    if (data?.generated_text) {
      return {
        text: data.generated_text,
        source: "tarot_generation_jobs_prod",
        source_key: data.job_key,
        matched_category_key: data.category_key,
        matched_topic_key: data.topic_key,
        matched_subtopic_key: data.subtopic_key,
        matched_timing_key: data.timing_key,
      };
    }
  }

  const meaningColumn = getCategoryMeaningColumn(categoryKey);

  const { data: orientationMeaning, error: orientationMeaningError } =
    await supabase
      .from("tarot_card_orientation_meanings_prod")
      .select(
        `
        card_key,
        orientation,
        core_meaning,
        love_meaning,
        work_meaning,
        money_meaning,
        relationship_meaning,
        health_meaning,
        spiritual_meaning
      `
      )
      .eq("card_key", cardKey)
      .eq("orientation", orientation)
      .eq("is_active", true)
      .maybeSingle();

  if (orientationMeaningError) {
    throw new Error(orientationMeaningError.message);
  }

  if (orientationMeaning) {
    const categoryText = orientationMeaning[meaningColumn];
    const coreText = orientationMeaning.core_meaning;

    if (categoryText) {
      return {
        text: categoryText,
        source: "tarot_card_orientation_meanings_prod",
        source_key: `${cardKey}_${orientation}_${meaningColumn}`,
        matched_category_key: categoryKey,
        matched_topic_key: null,
        matched_subtopic_key: null,
        matched_timing_key: null,
      };
    }

    if (coreText) {
      return {
        text: coreText,
        source: "tarot_card_orientation_meanings_prod",
        source_key: `${cardKey}_${orientation}_core_meaning`,
        matched_category_key: "core",
        matched_topic_key: null,
        matched_subtopic_key: null,
        matched_timing_key: null,
      };
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateReadingFromJobsBody;

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

    const lengthType = body.length_type ?? "normal";
    const toneType = body.tone_type ?? "soft";

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

        usage_type: body.usage_type ?? "default",

        question_text: body.question_text ?? "",

        status: "created",
        created_at: now,
        updated_at: now,
      });

    if (readingInsertError) {
      return jsonUtf8({ ok: false, error: readingInsertError.message }, 500);
    }

    const missingTexts: any[] = [];
    const fallbackTexts: any[] = [];

    const readingCards = await Promise.all(
      positions.map(async (position, index) => {
        const card = selectedCards[index];
        const orientation = randomOrientation();
        const timingKey = resolveTimingKey(position.position_name);

        const foundText = await findGeneratedTextFromJobs({
          supabase,
          categoryKey: category.category_key,
          topicKey: topic.topic_key,
          subtopicKey: subtopic.subtopic_key,
          timingKey,
          cardKey: card.card_key,
          orientation,
          lengthType,
          toneType,
        });

        if (!foundText?.text) {
          missingTexts.push({
            position_no: position.position_no,
            position_name: position.position_name,
            card_key: card.card_key,
            card_name: card.card_name,
            orientation,
            timing_key: timingKey,
            category_key: category.category_key,
            topic_key: topic.topic_key,
            subtopic_key: subtopic.subtopic_key,
            length_type: lengthType,
            tone_type: toneType,
          });
        } else if (foundText.source !== "tarot_generation_jobs_prod") {
          fallbackTexts.push({
            position_no: position.position_no,
            position_name: position.position_name,
            card_key: card.card_key,
            card_name: card.card_name,
            orientation,
            timing_key: timingKey,
            source: foundText.source,
            source_key: foundText.source_key,
            matched_category_key: foundText.matched_category_key,
            matched_topic_key: foundText.matched_topic_key,
            matched_subtopic_key: foundText.matched_subtopic_key,
            matched_timing_key: foundText.matched_timing_key,
          });
        }

        return {
          reading_key: readingKey,

          position_no: position.position_no,
          position_name: position.position_name,
          position_description: position.position_description,

          card_key: card.card_key,
          card_name: card.card_name,

          orientation,
          orientation_name: orientation === "upright" ? "正位置" : "逆位置",

          interpretation_text:
            foundText?.source === "tarot_generation_jobs_prod"
              ? foundText.text
              : `[FALLBACK]\n${foundText?.text ?? ""}`,

          created_at: now,
          updated_at: now,
        };
      })
    );

    const { error: cardsInsertError } = await supabase
      .from("tarot_reading_cards_prod")
      .insert(readingCards);

    if (cardsInsertError) {
      return jsonUtf8({ ok: false, error: cardsInsertError.message }, 500);
    }

    let finalStatus = "created";

    if (missingTexts.length > 0) {
      finalStatus = "created_with_missing_texts";
    } else if (fallbackTexts.length > 0) {
      finalStatus = "created_with_fallback_texts";
    }

    if (finalStatus !== "created") {
      await supabase
        .from("tarot_readings_prod")
        .update({
          status: finalStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("reading_key", readingKey);
    }

    return jsonUtf8({
      ok: true,
      reading_key: readingKey,
      spread_key: spread.spread_key,
      spread_name: spread.spread_name,
      card_count: spread.card_count,
      length_type: lengthType,
      tone_type: toneType,
      status: finalStatus,
      missing_text_count: missingTexts.length,
      fallback_text_count: fallbackTexts.length,
      missing_texts: missingTexts,
      fallback_texts: fallbackTexts,
      cards: readingCards,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}