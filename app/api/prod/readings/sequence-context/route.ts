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

function judgeThreeCardFlow(scores: number[]) {
  const [past, current, future] = scores;

  if (past <= -1 && current >= 0 && future >= 1) return "recovery_flow";
  if (past >= 0 && current >= 1 && future >= 1) return "growth_flow";
  if (past <= 0 && current <= 0 && future <= 0) return "stagnation_flow";

  if (Math.abs(current - past) >= 2 || Math.abs(future - current) >= 2) {
    return "turning_point_flow";
  }

  return "stagnation_flow";
}

function judgeGeneralFlow(scores: number[]) {
  if (scores.length === 0) return null;

  const first = scores[0];
  const last = scores[scores.length - 1];
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const negativeCount = scores.filter((score) => score <= -1).length;
  const positiveCount = scores.filter((score) => score >= 1).length;

  if (first <= -1 && last >= 1) return "recovery_flow";
  if (first >= 0 && average >= 1 && last >= 1) return "growth_flow";
  if (negativeCount >= Math.ceil(scores.length / 2)) return "stagnation_flow";
  if (Math.abs(last - first) >= 2) return "turning_point_flow";
  if (positiveCount >= Math.ceil(scores.length / 2)) return "growth_flow";

  return "stagnation_flow";
}

function judgeCelticCrossFlow(
  cards: Array<{
    position_no: number;
    energy_score: number;
  }>
) {
  const current = cards.find((card) => card.position_no === 1)?.energy_score ?? 0;
  const obstacle = cards.find((card) => card.position_no === 2)?.energy_score ?? 0;
  const nearFuture = cards.find((card) => card.position_no === 6)?.energy_score ?? 0;
  const finalResult = cards.find((card) => card.position_no === 10)?.energy_score ?? 0;

  if (current <= -1 && finalResult >= 1) return "recovery_flow";
  if (current >= 1 && nearFuture >= 1 && finalResult >= 1) return "growth_flow";
  if (obstacle <= -1 && finalResult <= 0) return "stagnation_flow";
  if (Math.abs(finalResult - current) >= 2) return "turning_point_flow";

  return judgeGeneralFlow([current, nearFuture, finalResult]);
}

function getFlowTargetPositions(spreadKey: string, usageType = "default") {
  switch (spreadKey) {
    case "one_oracle":
      return [1];

    case "yes_no":
      return [1, 2];

    case "three_card":
      return [1, 2, 3];

    case "diamond_cross":
      return [1, 2, 3, 4];

    case "jupiter":
      return [1, 2, 3, 4];

    case "two_choices":
      return [1, 2, 4, 3, 5];

    case "greek_cross":
      return [1, 2, 3, 5];

    case "pyramid":
      return [1, 2, 3, 6];

    case "star_of_david":
      return [1, 2, 3, 4, 5, 6];

    case "horseshoe":
      return [1, 2, 3, 7];

    case "hexagram":
      return [1, 2, 3, 7];

    case "v_spread":
      return [1, 2, 4, 6, 3, 5, 7];

    case "nine_card":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9];

    case "celtic_cross":
      return [1, 2, 6, 10];

    case "tree_of_life":
      return [10, 1, 5, 6];

    case "horoscope":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

    default:
      return null;
  }
}

function getPairFlowPositionPairs(spreadKey: string, usageType = "default") {
  switch (spreadKey) {
    case "one_oracle":
      return [];

    case "yes_no":
      return [[1, 2]];

    case "three_card":
      return [
        [1, 2],
        [2, 3],
      ];

    case "diamond_cross":
      return [
        [1, 3],
        [2, 3],
        [3, 4],
      ];

    case "jupiter":
      return [
        [1, 2],
        [2, 3],
        [3, 4],
      ];

    case "two_choices":
      return [
        [1, 2],
        [2, 4],
        [1, 3],
        [3, 5],
      ];

    case "greek_cross":
      return [
        [1, 2],
        [2, 3],
        [3, 5],
      ];

    case "pyramid":
      return [
        [1, 2],
        [2, 3],
        [3, 6],
        [4, 6],
        [5, 6],
      ];

    case "star_of_david":
      return [
        [1, 2],
        [2, 3],
        [4, 5],
        [5, 6],
        [3, 6],
      ];

    case "horseshoe":
      return [
        [1, 2],
        [2, 3],
        [3, 7],
      ];

    case "hexagram":
      return [
        [1, 2],
        [2, 3],
        [3, 7],
        [5, 7],
        [6, 7],
        [4, 7],
      ];

    case "v_spread":
      return [
        [1, 2],
        [2, 4],
        [4, 6],
        [1, 3],
        [3, 5],
        [5, 7],
      ];

    case "nine_card":
      return [
        [1, 2],
        [2, 3],
        [4, 5],
        [5, 6],
        [7, 8],
        [8, 9],
        [1, 4],
        [4, 7],
        [2, 5],
        [5, 8],
        [3, 6],
        [6, 9],
      ];

    case "celtic_cross":
      return [
        [1, 2],
        [1, 6],
        [6, 10],
      ];

    case "tree_of_life":
      return [
        [10, 1],
        [2, 6],
        [3, 6],
        [4, 6],
        [5, 6],
        [9, 6],
      ];

    case "horoscope":
      if (usageType === "monthly_fortune") {
        return [
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
          [5, 6],
          [6, 7],
          [7, 8],
          [8, 9],
          [9, 10],
          [10, 11],
          [11, 12],
          [12, 13],
        ];
      }

      return [
        [1, 13],
        [2, 13],
        [3, 13],
        [4, 13],
        [5, 13],
        [6, 13],
        [7, 13],
        [8, 13],
        [9, 13],
        [10, 13],
        [11, 13],
        [12, 13],
      ];

    default:
      return null;
  }
}

async function loadPositionNameMap(params: {
  supabase: any;
  spreadKey: string;
  usageType: string;
}) {
  const { supabase, spreadKey, usageType } = params;

  let { data, error } = await supabase
    .from("tarot_spread_positions_prod")
    .select("position_no, position_name")
    .eq("spread_key", spreadKey)
    .eq("usage_type", usageType)
    .order("position_no", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if ((!data || data.length === 0) && usageType !== "default") {
    const fallback = await supabase
      .from("tarot_spread_positions_prod")
      .select("position_no, position_name")
      .eq("spread_key", spreadKey)
      .eq("usage_type", "default")
      .order("position_no", { ascending: true });

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    data = fallback.data ?? [];
  }

  return new Map(
    (data ?? []).map((position: any) => [
      Number(position.position_no),
      position.position_name,
    ])
  );
}

async function findPairFlowPattern(params: {
  supabase: any;
  reading: any;
  fromScore: number;
  toScore: number;
}) {
  const { supabase, reading, fromScore, toScore } = params;

  function buildBaseQuery() {
    return supabase
      .from("tarot_pair_flow_patterns_prod")
      .select(`
        pair_flow_key,
        category_key,
        topic_key,
        subtopic_key,
        flow_type,
        flow_keywords,
        pair_meaning_short,
        pair_meaning_long,
        advice_text,
        priority
      `)
      .lte("from_score_min", fromScore)
      .gte("from_score_max", fromScore)
      .lte("to_score_min", toScore)
      .gte("to_score_max", toScore)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();
  }

  const exact = await buildBaseQuery()
    .eq("category_key", reading.category_key)
    .eq("topic_key", reading.topic_key)
    .eq("subtopic_key", reading.subtopic_key);

  if (exact.error) throw new Error(exact.error.message);
  if (exact.data) return exact.data;

  const topic = await buildBaseQuery()
    .eq("category_key", reading.category_key)
    .eq("topic_key", reading.topic_key)
    .is("subtopic_key", null);

  if (topic.error) throw new Error(topic.error.message);
  if (topic.data) return topic.data;

  const category = await buildBaseQuery()
    .eq("category_key", reading.category_key)
    .is("topic_key", null)
    .is("subtopic_key", null);

  if (category.error) throw new Error(category.error.message);
  if (category.data) return category.data;

  const generic = await buildBaseQuery()
    .is("category_key", null)
    .is("topic_key", null)
    .is("subtopic_key", null);

  if (generic.error) throw new Error(generic.error.message);

  return generic.data ?? null;
}

async function findSequenceMeaning(params: {
  supabase: any;
  reading: any;
  flowType: string;
}) {
  const { supabase, reading, flowType } = params;

  const exactSequence = await supabase
    .from("tarot_card_sequence_meanings_prod")
    .select(`
      sequence_key,
      spread_key,
      category_key,
      topic_key,
      subtopic_key,
      flow_type,
      flow_keywords,
      sequence_meaning_short,
      sequence_meaning_long,
      advice_text
    `)
    .eq("spread_key", reading.spread_key)
    .eq("category_key", reading.category_key)
    .eq("topic_key", reading.topic_key)
    .eq("subtopic_key", reading.subtopic_key)
    .eq("flow_type", flowType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (exactSequence.error) throw new Error(exactSequence.error.message);
  if (exactSequence.data) return exactSequence.data;

  const topicSequence = await supabase
    .from("tarot_card_sequence_meanings_prod")
    .select(`
      sequence_key,
      spread_key,
      category_key,
      topic_key,
      subtopic_key,
      flow_type,
      flow_keywords,
      sequence_meaning_short,
      sequence_meaning_long,
      advice_text
    `)
    .eq("spread_key", reading.spread_key)
    .eq("category_key", reading.category_key)
    .eq("topic_key", reading.topic_key)
    .is("subtopic_key", null)
    .eq("flow_type", flowType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (topicSequence.error) throw new Error(topicSequence.error.message);
  if (topicSequence.data) return topicSequence.data;

  const categorySequence = await supabase
    .from("tarot_card_sequence_meanings_prod")
    .select(`
      sequence_key,
      spread_key,
      category_key,
      topic_key,
      subtopic_key,
      flow_type,
      flow_keywords,
      sequence_meaning_short,
      sequence_meaning_long,
      advice_text
    `)
    .eq("spread_key", reading.spread_key)
    .eq("category_key", reading.category_key)
    .is("topic_key", null)
    .is("subtopic_key", null)
    .eq("flow_type", flowType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (categorySequence.error) throw new Error(categorySequence.error.message);

  return categorySequence.data ?? null;
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

    const usageType = reading.usage_type ?? "default";

    const positionNameMap = await loadPositionNameMap({
      supabase,
      spreadKey: reading.spread_key,
      usageType,
    });

    const { data: cards, error: cardsError } = await supabase
      .from("tarot_reading_cards_prod")
      .select("*")
      .eq("reading_key", readingKey)
      .order("position_no", { ascending: true });

    if (cardsError) {
      return jsonUtf8({ ok: false, error: cardsError.message }, 500);
    }

    const readingCards = cards ?? [];

    if (readingCards.length === 0) {
      return jsonUtf8({ ok: false, error: "reading cards not found" }, 404);
    }

    const cardKeys = readingCards.map((card) => card.card_key);

    const { data: cardMasters, error: masterError } = await supabase
      .from("tarot_cards_prod")
      .select(`
        card_key,
        energy_score_upright,
        energy_score_reversed,
        flow_tags
      `)
      .in("card_key", cardKeys);

    if (masterError) {
      return jsonUtf8({ ok: false, error: masterError.message }, 500);
    }

    const masterMap = new Map(
      (cardMasters ?? []).map((card) => [card.card_key, card])
    );

    const cardsWithScores = readingCards.map((card) => {
      const master = masterMap.get(card.card_key) as any;

      const score =
        card.orientation === "upright"
          ? master?.energy_score_upright ?? 0
          : master?.energy_score_reversed ?? 0;

      const positionName =
        positionNameMap.get(Number(card.position_no)) ??
        card.position_name ??
        `ポジション${card.position_no}`;

      return {
        position_no: card.position_no,
        position_name: positionName,
        card_key: card.card_key,
        card_name: card.card_name,
        orientation: card.orientation,
        orientation_name: card.orientation_name,
        energy_score: score,
        flow_tags: master?.flow_tags ?? [],
      };
    });

    const targetPositions = getFlowTargetPositions(
      reading.spread_key,
      usageType
    );

    const flowCards = targetPositions
      ? targetPositions
          .map((positionNo) =>
            cardsWithScores.find((card) => card.position_no === positionNo)
          )
          .filter(
            (card): card is (typeof cardsWithScores)[number] =>
              card !== undefined
          )
      : cardsWithScores;

    const scores = flowCards.map((card) => card.energy_score);

    let flowType: string | null = null;

    if (reading.spread_key === "three_card" && scores.length === 3) {
      flowType = judgeThreeCardFlow(scores);
    } else if (reading.spread_key === "celtic_cross") {
      flowType = judgeCelticCrossFlow(cardsWithScores);
    } else {
      flowType = judgeGeneralFlow(scores);
    }

    const sequenceMeaning = flowType
      ? await findSequenceMeaning({
          supabase,
          reading,
          flowType,
        })
      : null;

    const pairPositionPairs = getPairFlowPositionPairs(
      reading.spread_key,
      usageType
    );

    const pairCardPairs = pairPositionPairs
      ? pairPositionPairs
          .map(([fromNo, toNo]) => {
            const fromCard = cardsWithScores.find(
              (card) => card.position_no === fromNo
            );
            const toCard = cardsWithScores.find(
              (card) => card.position_no === toNo
            );

            if (!fromCard || !toCard) return null;

            return {
              fromCard,
              toCard,
            };
          })
          .filter(
            (
              pair
            ): pair is {
              fromCard: (typeof cardsWithScores)[number];
              toCard: (typeof cardsWithScores)[number];
            } => pair !== null
          )
      : cardsWithScores.slice(0, -1).map((fromCard, index) => ({
          fromCard,
          toCard: cardsWithScores[index + 1],
        }));

    const pairFlows = [];

    if (flowType) {
      for (const pair of pairCardPairs) {
        const { fromCard, toCard } = pair;

        const pairFlowPattern = await findPairFlowPattern({
          supabase,
          reading,
          fromScore: fromCard.energy_score,
          toScore: toCard.energy_score,
        });

        pairFlows.push({
          from_position_no: fromCard.position_no,
          from_position_name: fromCard.position_name,
          from_card_name: fromCard.card_name,
          from_orientation_name: fromCard.orientation_name,
          from_score: fromCard.energy_score,

          to_position_no: toCard.position_no,
          to_position_name: toCard.position_name,
          to_card_name: toCard.card_name,
          to_orientation_name: toCard.orientation_name,
          to_score: toCard.energy_score,

          pair_flow_pattern: pairFlowPattern,
        });
      }
    }

    return jsonUtf8({
      ok: true,
      reading_key: readingKey,
      spread_key: reading.spread_key,
      spread_name: reading.spread_name,
      usage_type: usageType,
      category_key: reading.category_key,
      topic_key: reading.topic_key,
      subtopic_key: reading.subtopic_key,
      cards: cardsWithScores,
      flow_target_positions: targetPositions,
      flow_scores: scores,
      flow_type: flowType,
      sequence_meaning: sequenceMeaning ?? null,
      pair_flow_position_pairs: pairPositionPairs,
      pair_flows: pairFlows,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}