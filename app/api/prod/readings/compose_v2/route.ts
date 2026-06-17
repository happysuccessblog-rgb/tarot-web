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

function joinBlocks(blocks: Array<string | null | undefined>) {
  return blocks
    .map((text) => (text ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function normalizeFallbackText(
  text: string | null | undefined,
  positionName: string | null | undefined
) {
  const value = (text ?? "").trim();
  if (!value.startsWith("[FALLBACK]")) return value;

  const raw = value.replace("[FALLBACK]", "").trim();
  const name = positionName ?? "";

  if (!raw) return "";

  if (name.includes("過去")) return `これまでの流れとしては、${raw}`;
  if (name.includes("未来")) return `今後の流れとしては、${raw}`;
  if (name.includes("現在") || name.includes("現状")) {
    return `現在の状況としては、${raw}`;
  }
  if (name.includes("潜在") || name.includes("本音")) {
    return `表には出にくい部分としては、${raw}`;
  }
  if (name.includes("顕在") || name.includes("意識")) {
    return `自覚しやすい部分としては、${raw}`;
  }
  if (name.includes("障害") || name.includes("問題")) {
    return `今の課題としては、${raw}`;
  }
  if (name.includes("アドバイス") || name.includes("助言")) {
    return `今必要な意識としては、${raw}`;
  }

  return raw;
}

type TimelinePairType = "flow";

type EmotionFlowType =
  | "positive_flow"
  | "negative_flow"
  | "blocked_flow"
  | "neutral_flow";

type TimelineRole = "past" | "present" | "future";

type CardWithScore = {
  position_no: number;
  position_name: string;
  card_key: string;
  card_name: string;
  orientation: string;
  orientation_name: string;
  energy_score: number;
  flow_tags?: string[];
  position_role?: string | null;
  meaning_label?: string | null;
  position_weight?: number;
};

type CardMasterForBalance = {
  card_id: string;
  card_name: string;
  arcana_type: string | null;
  suit: string | null;
  number: number | null;
  is_active?: boolean;
};

type CardStateForBalance = {
  card_id: string;
  state_type: string;
  intensity_base: number | null;
  class_key?: string | null;
  is_active?: boolean;
};

type CardForBalance = CardWithScore & {
  card_id?: string;
  arcana_type?: string | null;
  suit?: string | null;
  number?: number | null;
  state_type?: string;
  state_intensity_base?: number;
};

type SpreadBalanceEvaluation = {
  spread_score: number;
  spread_flow_type: string;
  metrics: {
    total_cards: number;
    upright_count: number;
    reversed_count: number;
    light_ratio: number;
    dark_ratio: number;
    major_count: number;
    minor_count: number;
    major_ratio: number;
    wands_count: number;
    cups_count: number;
    swords_count: number;
    pentacles_count: number;
    dominant_suit: string | null;
    number_avg: number | null;
    reversed_intensity_sum: number;
    position_weight_score: number;
  };
  summary_blocks: string[];
};

function clampIntensityLevel(value: number) {
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return value;
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
  const current = cards.find((card) => Number(card.position_no) === 1)?.energy_score ?? 0;
  const obstacle = cards.find((card) => Number(card.position_no) === 2)?.energy_score ?? 0;
  const nearFuture = cards.find((card) => Number(card.position_no) === 6)?.energy_score ?? 0;
  const finalResult = cards.find((card) => Number(card.position_no) === 10)?.energy_score ?? 0;

  if (current <= -1 && finalResult >= 1) return "recovery_flow";
  if (current >= 1 && nearFuture >= 1 && finalResult >= 1) return "growth_flow";
  if (obstacle <= -1 && finalResult <= 0) return "stagnation_flow";
  if (Math.abs(finalResult - current) >= 2) return "turning_point_flow";

  return judgeGeneralFlow([current, nearFuture, finalResult]);
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

  if (error) throw new Error(error.message);

  if ((!data || data.length === 0) && usageType !== "default") {
    const fallback = await supabase
      .from("tarot_spread_positions_prod")
      .select("position_no, position_name")
      .eq("spread_key", spreadKey)
      .eq("usage_type", "default")
      .order("position_no", { ascending: true });

    if (fallback.error) throw new Error(fallback.error.message);
    data = fallback.data ?? [];
  }

  return new Map(
    (data ?? []).map((position: any) => [
      Number(position.position_no),
      position.position_name,
    ])
  );
}

async function loadPositionRoleMap(params: {
  supabase: any;
  spreadKey: string;
}) {
  const { supabase, spreadKey } = params;

  const { data, error } = await supabase
    .from("tarot_spread_position_mapping_v2")
    .select("position_no, position_role, meaning_label, weight")
    .eq("spread_key", spreadKey)
    .eq("is_active", true)
    .order("position_no", { ascending: true });

  if (error) throw new Error(error.message);

  return new Map<number, any>(
    (data ?? []).map((row: any) => [
      Number(row.position_no),
      {
        position_role: row.position_role,
        meaning_label: row.meaning_label,
        weight: row.weight ?? 1,
      },
    ])
  );
}


async function resolveTopicRoleForComposeV2(params: {
  supabase: any;
  reading: any;
}) {
  const { supabase, reading } = params;

  const { data, error } = await supabase
    .from("tarot_topic_role_mapping_v2")
    .select("role_key, role_name")
    .eq("category_key", reading.category_key)
    .eq("topic_key", reading.topic_key)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ?? null;
}

function attachPositionRoles(params: {
  cardsWithScores: CardWithScore[];
  positionRoleMap: Map<number, any>;
}) {
  const { cardsWithScores, positionRoleMap } = params;

  return cardsWithScores.map((card) => {
    const mapping = positionRoleMap.get(Number(card.position_no));

    return {
      ...card,
      position_role: mapping?.position_role ?? null,
      meaning_label: mapping?.meaning_label ?? null,
      position_weight: mapping?.weight ?? 1,
    };
  });
}

function buildTimelineRolePairs(cards: CardWithScore[]) {
  const byRole = new Map<string, CardWithScore>();

  for (const card of cards) {
    if (!card.position_role) continue;
    byRole.set(card.position_role, card);
  }

  const pairs: Array<{
    pair_type: TimelinePairType;
    from_position_role: TimelineRole;
    to_position_role: TimelineRole;
    fromCard: CardWithScore;
    toCard: CardWithScore;
  }> = [];

  const past = byRole.get("past");
  const present = byRole.get("present");
  const future = byRole.get("future");

  if (past && present) {
    pairs.push({
      pair_type: "flow",
      from_position_role: "past",
      to_position_role: "present",
      fromCard: past,
      toCard: present,
    });
  }

  if (present && future) {
    pairs.push({
      pair_type: "flow",
      from_position_role: "present",
      to_position_role: "future",
      fromCard: present,
      toCard: future,
    });
  }

  return pairs;
}

function judgeEmotionFlowType(params: {
  fromScore: number;
  toScore: number;
}): EmotionFlowType {
  const { fromScore, toScore } = params;
  const diff = toScore - fromScore;

  if (toScore >= 1 && diff >= 0) return "positive_flow";
  if (toScore <= -1 && diff <= 0) return "negative_flow";

  if (fromScore <= 0 && toScore <= 0 && Math.abs(diff) <= 1) {
    return "blocked_flow";
  }

  return "neutral_flow";
}

async function findTopicFlowWeight(params: {
  supabase: any;
  categoryKey: string;
  topicKey: string;
  emotionFlowType: EmotionFlowType;
}) {
  const { supabase, categoryKey, topicKey, emotionFlowType } = params;

  const flowType = emotionFlowType.replace("_flow", "");

  const { data, error } = await supabase
    .from("tarot_topic_flow_weights_prod")
    .select("*")
    .eq("category_key", categoryKey)
    .eq("topic_key", topicKey)
    .eq("flow_type", flowType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ?? null;
}

function resolveIntensityLevel(params: {
  fromPositionRole: TimelineRole;
  toPositionRole: TimelineRole;
  fromScore: number;
  toScore: number;
  topicFlowWeight: any | null;
}) {
  const {
    fromPositionRole,
    toPositionRole,
    fromScore,
    toScore,
    topicFlowWeight,
  } = params;

  const scoreGap = Math.abs(toScore - fromScore);

  const base =
    scoreGap >= 2 ? 3 :
    scoreGap === 1 ? 2 :
    1;

  const pairWeight =
    fromPositionRole === "past" && toPositionRole === "present"
      ? topicFlowWeight?.past_present_weight ?? 1
      : topicFlowWeight?.present_future_weight ?? 1;

  const intensityBias = topicFlowWeight?.intensity_bias ?? 0;

  let adjusted = base;

  if (pairWeight >= 3) adjusted += 1;
  if (pairWeight <= 1) adjusted -= 1;

  if (intensityBias >= 2) adjusted += 1;
  if (intensityBias <= -2) adjusted -= 1;

  return clampIntensityLevel(adjusted);
}

async function findTimelinePairFlowPattern(params: {
  supabase: any;
  reading: any;
  pairType: TimelinePairType;
  fromPositionRole: TimelineRole;
  toPositionRole: TimelineRole;
  emotionFlowType: EmotionFlowType;
  intensityLevel: number;
}) {
  const {
    supabase,
    reading,
    pairType,
    fromPositionRole,
    toPositionRole,
    emotionFlowType,
    intensityLevel,
  } = params;

  const { data, error } = await supabase
    .from("tarot_pair_flow_patterns_prod_v2")
    .select("*")
    .eq("category_key", reading.category_key)
    .eq("topic_key", reading.topic_key)
    .eq("pair_type", pairType)
    .eq("from_position_role", fromPositionRole)
    .eq("to_position_role", toPositionRole)
    .eq("emotion_flow_type", emotionFlowType)
    .eq("intensity_level", intensityLevel)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ?? null;
}

async function buildTimelinePairFlows(params: {
  supabase: any;
  reading: any;
  cardsWithRoles: CardWithScore[];
}) {
  const { supabase, reading, cardsWithRoles } = params;

  const timelinePairs = buildTimelineRolePairs(cardsWithRoles);
  const results: any[] = [];

  for (const pair of timelinePairs) {
    const emotionFlowType = judgeEmotionFlowType({
      fromScore: pair.fromCard.energy_score,
      toScore: pair.toCard.energy_score,
    });

    const topicFlowWeight = await findTopicFlowWeight({
      supabase,
      categoryKey: reading.category_key,
      topicKey: reading.topic_key,
      emotionFlowType,
    });

    const intensityLevel = resolveIntensityLevel({
      fromPositionRole: pair.from_position_role,
      toPositionRole: pair.to_position_role,
      fromScore: pair.fromCard.energy_score,
      toScore: pair.toCard.energy_score,
      topicFlowWeight,
    });

    const pattern = await findTimelinePairFlowPattern({
      supabase,
      reading,
      pairType: pair.pair_type,
      fromPositionRole: pair.from_position_role,
      toPositionRole: pair.to_position_role,
      emotionFlowType,
      intensityLevel,
    });

    results.push({
      pair_type: pair.pair_type,
      from_position_role: pair.from_position_role,
      to_position_role: pair.to_position_role,

      from_position_no: pair.fromCard.position_no,
      from_position_name: pair.fromCard.position_name,
      from_card_name: pair.fromCard.card_name,
      from_orientation_name: pair.fromCard.orientation_name,
      from_score: pair.fromCard.energy_score,

      to_position_no: pair.toCard.position_no,
      to_position_name: pair.toCard.position_name,
      to_card_name: pair.toCard.card_name,
      to_orientation_name: pair.toCard.orientation_name,
      to_score: pair.toCard.energy_score,

      emotion_flow_type: emotionFlowType,
      intensity_level: intensityLevel,
      topic_flow_weight: topicFlowWeight,
      pair_flow_pattern: pattern,
    });
  }

  return results;
}

function buildTimelinePairFlowNarrative(pairFlows: any[]) {
  const blocks = pairFlows
    .map((flow) => flow.pair_flow_pattern?.pair_meaning_long)
    .map((text) => (text ?? "").trim())
    .filter(Boolean);

  if (blocks.length === 0) return [];

  return [`■ 流れの変化\n${blocks.join("\n\n")}`];
}

async function findCelticLayerClass(params: {
  supabase: any;
  reading: any;
  card: CardWithScore;
  layer: "conscious" | "subconscious";
}) {
  const { supabase, card, layer } = params;

  const tableName =
    layer === "conscious"
      ? "tarot_celtic_conscious_layer"
      : "tarot_celtic_subconscious_layer";

  const stateType =
    card.orientation === "upright" ? "upright" : "reversed";

  const { data: master, error: masterError } = await supabase
    .from("tarot_card_master")
    .select("card_id")
    .eq("card_key", card.card_key)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (masterError) throw new Error(masterError.message);

  if (!master?.card_id) return null;

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("category_key", "general")
    .eq("topic_key", "general")
    .eq("card_id", master.card_id)
    .eq("state_type", stateType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data ?? null;
}

async function buildCelticInnerPairReading(params: {
  supabase: any;
  reading: any;
  cardsWithScores: CardWithScore[];
}) {
  const { supabase, reading, cardsWithScores } = params;

  if (reading.spread_key !== "celtic_cross") return null;

  const consciousCard = cardsWithScores.find(
    (card) => Number(card.position_no) === 3
  );

  const subconsciousCard = cardsWithScores.find(
    (card) => Number(card.position_no) === 4
  );

  if (!consciousCard || !subconsciousCard) return null;

  const consciousLayer = await findCelticLayerClass({
    supabase,
    reading,
    card: consciousCard,
    layer: "conscious",
  });

  const subconsciousLayer = await findCelticLayerClass({
    supabase,
    reading,
    card: subconsciousCard,
    layer: "subconscious",
  });

  const consciousClass = consciousLayer?.class_type ?? null;
  const subconsciousClass = subconsciousLayer?.class_type ?? null;

  if (!consciousClass || !subconsciousClass) {
    return {
      reading_text: "",
      conscious_card: consciousCard,
      subconscious_card: subconsciousCard,
      conscious_layer: consciousLayer,
      subconscious_layer: subconsciousLayer,
      rpc_result: null,
    };
  }

  const { data, error } = await supabase.rpc(
    "get_celtic_cross_inner_pair_reading",
    {
      p_category_key: reading.category_key,
      p_topic_key: reading.topic_key,
      p_subconscious_class: subconsciousClass,
      p_conscious_class: consciousClass,
    }
  );

  if (error) throw new Error(error.message);

  const rpcResult = data?.[0] ?? null;

  return {
    reading_text: rpcResult?.reading_text ?? "",
    conscious_card: consciousCard,
    subconscious_card: subconsciousCard,
    conscious_class: consciousClass,
    subconscious_class: subconsciousClass,
    conscious_layer: consciousLayer,
    subconscious_layer: subconsciousLayer,
    rpc_result: rpcResult,
  };
}

function buildCelticInnerPairNarrative(celticInnerPairReading: any | null) {
  const text = (celticInnerPairReading?.reading_text ?? "").trim();

  if (!text) return [];

  return [`■ 潜在意識と顕在意識の関係\n${text}`];
}

async function loadCardMasterForBalance(params: {
  supabase: any;
  cardKeys: string[];
}) {
  const { supabase, cardKeys } = params;

  const { data, error } = await supabase
    .from("tarot_card_master")
    .select(`
      card_key,
      card_id,
      card_name,
      arcana_type,
      suit,
      number,
      is_active
    `)
    .in("card_key", cardKeys)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  return new Map<string, CardMasterForBalance>(
    (data ?? []).map((row: any) => [
      String(row.card_key),
      {
        card_id: row.card_id,
        card_name: row.card_name,
        arcana_type: row.arcana_type,
        suit: row.suit,
        number: row.number,
        is_active: row.is_active,
      },
    ])
  );
}

async function loadCardStatesForBalance(params: {
  supabase: any;
  cardKeys: string[];
}) {
  const { supabase, cardKeys } = params;

  const { data, error } = await supabase
    .from("tarot_card_states")
    .select(`
      card_key,
      card_id,
      state_type,
      intensity_base,
      class_key,
      is_active
    `)
    .in("card_key", cardKeys)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  return new Map<string, CardStateForBalance>(
    (data ?? []).map((row: any) => [
      `${String(row.card_key)}:${String(row.state_type)}`,
      {
        card_id: row.card_id,
        state_type: row.state_type,
        intensity_base: row.intensity_base ?? 0,
        class_key: row.class_key ?? null,
        is_active: row.is_active,
      },
    ])
  );
}

function attachBalanceMetadata(params: {
  cardsWithRoles: CardWithScore[];
  cardMasterMap: Map<string, CardMasterForBalance>;
  cardStateMap: Map<string, CardStateForBalance>;
}) {
  const { cardsWithRoles, cardMasterMap, cardStateMap } = params;

  return cardsWithRoles.map((card) => {
    const stateType =
      card.orientation === "upright" ? "upright" : "reversed";

    const master = cardMasterMap.get(card.card_key);
    const state = cardStateMap.get(`${card.card_key}:${stateType}`);

    return {
      ...card,
      card_id: card.card_key,
      arcana_type: master?.arcana_type ?? null,
      suit: master?.suit ?? null,
      number: master?.number ?? null,
      state_type: stateType,
      state_intensity_base: state?.intensity_base ?? 0,
    };
  });
}

function countBySuit(cards: CardForBalance[]) {
  return {
    wands: cards.filter((card) => card.suit === "wands").length,
    cups: cards.filter((card) => card.suit === "cups").length,
    swords: cards.filter((card) => card.suit === "swords").length,
    pentacles: cards.filter((card) => card.suit === "pentacles").length,
  };
}

function getDominantSuit(suitCounts: {
  wands: number;
  cups: number;
  swords: number;
  pentacles: number;
}) {
  const entries = Object.entries(suitCounts);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return null;
  if (sorted[0][1] === 0) return null;
  if (sorted[1] && sorted[0][1] === sorted[1][1]) return null;

  return sorted[0][0];
}

function calculateSuitBalanceScore(params: {
  totalCards: number;
  suitCounts: {
    wands: number;
    cups: number;
    swords: number;
    pentacles: number;
  };
}) {
  const { totalCards, suitCounts } = params;

  if (totalCards === 0) return 0;

  const counts = [
    suitCounts.wands,
    suitCounts.cups,
    suitCounts.swords,
    suitCounts.pentacles,
  ];

  const max = Math.max(...counts);
  const min = Math.min(...counts);

  return 1 - (max - min) / totalCards;
}

function calculatePositionWeightScore(cards: CardForBalance[]) {
  if (cards.length === 0) return 0;

  const weightedScoreSum = cards.reduce((sum, card) => {
    const weight = card.position_weight ?? 1;
    const normalizedEnergy = (card.energy_score + 2) / 4;

    return sum + normalizedEnergy * weight;
  }, 0);

  const totalWeight = cards.reduce(
    (sum, card) => sum + (card.position_weight ?? 1),
    0
  );

  if (totalWeight === 0) return 0;

  return weightedScoreSum / totalWeight;
}

function judgeSpreadBalanceFlowType(params: {
  spreadKey: string;
  usageType: string;
  lightRatio: number;
  darkRatio: number;
  majorRatio: number;
  suitCounts: {
    wands: number;
    cups: number;
    swords: number;
    pentacles: number;
  };
  dominantSuit: string | null;
  positionWeightScore: number;
}) {
  const {
    spreadKey,
    usageType,
    lightRatio,
    darkRatio,
    majorRatio,
    suitCounts,
    dominantSuit,
    positionWeightScore,
  } = params;

  if (majorRatio >= 0.4) return "fated_event";
  if (darkRatio >= 0.6) return "internal_conflict";
  if (lightRatio >= 0.7 && positionWeightScore >= 0.55) return "positive_flow";

  if (dominantSuit === "wands") return "action_driven";
  if (dominantSuit === "cups") return "emotional_flow";
  if (dominantSuit === "swords") return "mental_focus";
  if (dominantSuit === "pentacles") return "material_focus";

  if (spreadKey === "horoscope" && usageType === "default") {
    const suitTotal =
      suitCounts.wands +
      suitCounts.cups +
      suitCounts.swords +
      suitCounts.pentacles;

    const hasSuitGap =
      suitTotal > 0 &&
      Math.max(
        suitCounts.wands,
        suitCounts.cups,
        suitCounts.swords,
        suitCounts.pentacles
      ) -
        Math.min(
          suitCounts.wands,
          suitCounts.cups,
          suitCounts.swords,
          suitCounts.pentacles
        ) >= 3;

    if (hasSuitGap) return "unbalanced_distribution";
  }

  return "balanced_flow";
}

function buildSpreadBalanceSummaryBlocks(params: {
  spreadKey: string;
  usageType: string;
  spreadScore: number;
  spreadFlowType: string;
  metrics: SpreadBalanceEvaluation["metrics"];
}) {
  const { spreadKey, usageType, spreadScore, spreadFlowType, metrics } = params;

  const scoreText =
    spreadScore >= 80
      ? "全体としては安定感が強く、前向きな流れがまとまりやすい配置です。"
      : spreadScore >= 60
      ? "全体としては比較的安定しており、現実的な進展を見込みやすい配置です。"
      : spreadScore >= 40
      ? "全体としては中立的で、状況次第で流れが変わりやすい配置です。"
      : "全体としては不安定な要素が強く、慎重に状況を見極める必要がある配置です。";

  const lightDarkText =
    metrics.light_ratio >= 0.7
      ? "正位置が多く、意識や状況が外へ向かいやすい状態です。"
      : metrics.dark_ratio >= 0.6
      ? "逆位置が多く、内面的な調整や見直しが重要になりやすい状態です。"
      : "正位置と逆位置のバランスが取れており、明暗の両面を見ながら判断する段階です。";

  const flowText = (() => {
    switch (spreadFlowType) {
      case "fated_event":
        return "大アルカナの比率が高く、個人の意思だけでは動かしにくい大きな流れが関わっています。";
      case "internal_conflict":
        return "内面的な葛藤や迷いが表に出やすく、まずは気持ちの整理が鍵になります。";
      case "positive_flow":
        return "前向きな流れが形成されており、今ある勢いを活かしやすい状態です。";
      case "action_driven":
        return "行動や変化への意識が強く、実際に動くことで流れが開きやすくなります。";
      case "emotional_flow":
        return "感情や関係性の影響が強く、気持ちの扱い方が全体の流れを左右します。";
      case "mental_focus":
        return "思考や判断の比重が高く、冷静な分析や言葉の選び方が重要です。";
      case "material_focus":
        return "現実面や安定性がテーマになりやすく、具体的な準備や継続が鍵になります。";
      case "unbalanced_distribution":
        return "特定の要素に偏りがあり、強く出ている領域と不足している領域の差が目立ちます。";
      default:
        return "複数の要素が大きく偏らず、全体のバランスを見ながら進める流れです。";
    }
  })();

  const suitText = (() => {
    switch (metrics.dominant_suit) {
      case "wands":
        return "特にワンドが強く、行動・情熱・変化への意識が中心になっています。";
      case "cups":
        return "特にカップが強く、感情・愛情・人間関係が中心になっています。";
      case "swords":
        return "特にソードが強く、思考・判断・言葉の影響が中心になっています。";
      case "pentacles":
        return "特にペンタクルが強く、現実面・安定・成果が中心になっています。";
      default:
        return "スートの偏りは強すぎず、複数のテーマが並行して影響しています。";
    }
  })();

  if (spreadKey === "horoscope" && usageType === "default") {
    return [
      [
        "■ 全体バランス",
        scoreText,
        lightDarkText,
        flowText,
        suitText,
      ].join("\n"),
    ];
  }

  return [
    [
      "■ 全体バランス",
      scoreText,
      lightDarkText,
      flowText,
    ].join("\n"),
  ];
}

function evaluateSpreadBalance(params: {
  spreadKey: string;
  usageType: string;
  cards: CardForBalance[];
}): SpreadBalanceEvaluation {
  const { spreadKey, usageType, cards } = params;

  const totalCards = cards.length;

  const uprightCount = cards.filter(
    (card) => card.state_type === "upright"
  ).length;

  const reversedCount = cards.filter(
    (card) => card.state_type === "reversed"
  ).length;

  const lightRatio = totalCards > 0 ? uprightCount / totalCards : 0;
  const darkRatio = totalCards > 0 ? reversedCount / totalCards : 0;

  const majorCount = cards.filter(
    (card) => card.arcana_type === "major"
  ).length;

  const minorCount = totalCards - majorCount;
  const majorRatio = totalCards > 0 ? majorCount / totalCards : 0;

  const suitCounts = countBySuit(cards);
  const dominantSuit = getDominantSuit(suitCounts);

  const numberedCards = cards.filter((card) => {
    if (card.arcana_type !== "minor") return false;
    if (typeof card.number !== "number") return false;

    const number = Number(card.number);

    return number >= 1 && number <= 10;
  });

  const numberAvg =
    numberedCards.length > 0
      ? numberedCards.reduce((sum, card) => sum + Number(card.number), 0) /
        numberedCards.length
      : null;

  const reversedIntensitySum = cards
    .filter((card) => card.state_type === "reversed")
    .reduce((sum, card) => sum + (card.state_intensity_base ?? 0), 0);

  const suitBalanceScore = calculateSuitBalanceScore({
    totalCards,
    suitCounts,
  });

  const positionWeightScore = calculatePositionWeightScore(cards);

  const numberFlowScore =
    numberAvg === null ? 0.5 : 1 - Math.min(Math.abs(numberAvg - 7) / 7, 1);

  const reversedPressureScore =
    1 - Math.min(reversedIntensitySum / Math.max(totalCards * 3, 1), 1);

  const rawScore =
    lightRatio * 30 +
    majorRatio * 20 +
    suitBalanceScore * 15 +
    numberFlowScore * 10 +
    reversedPressureScore * 15 +
    positionWeightScore * 10;

  const spreadScore = Math.round(Math.max(0, Math.min(rawScore, 100)));

  const spreadFlowType = judgeSpreadBalanceFlowType({
    spreadKey,
    usageType,
    lightRatio,
    darkRatio,
    majorRatio,
    suitCounts,
    dominantSuit,
    positionWeightScore,
  });

  const metrics = {
    total_cards: totalCards,
    upright_count: uprightCount,
    reversed_count: reversedCount,
    light_ratio: Number(lightRatio.toFixed(3)),
    dark_ratio: Number(darkRatio.toFixed(3)),
    major_count: majorCount,
    minor_count: minorCount,
    major_ratio: Number(majorRatio.toFixed(3)),
    wands_count: suitCounts.wands,
    cups_count: suitCounts.cups,
    swords_count: suitCounts.swords,
    pentacles_count: suitCounts.pentacles,
    dominant_suit: dominantSuit,
    number_avg: numberAvg === null ? null : Number(numberAvg.toFixed(2)),
    reversed_intensity_sum: reversedIntensitySum,
    position_weight_score: Number(positionWeightScore.toFixed(3)),
  };

  return {
    spread_score: spreadScore,
    spread_flow_type: spreadFlowType,
    metrics,
    summary_blocks: buildSpreadBalanceSummaryBlocks({
      spreadKey,
      usageType,
      spreadScore,
      spreadFlowType,
      metrics,
    }),
  };
}

async function findSequenceMeaning(params: {
  supabase: any;
  reading: any;
  flowType: string;
  roleKey?: string | null;
}) {
  const { supabase, reading, flowType, roleKey } = params;

  async function run(query: any) {
    const result = await query
      .eq("flow_type", flowType)
      .eq("is_active", true)
      .order("sequence_key", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);
    return result.data ?? null;
  }

  const candidates: Array<() => Promise<any> | null> = [
    () =>
      run(
        supabase
          .from("tarot_card_sequence_meanings_prod")
          .select("*")
          .eq("spread_key", reading.spread_key)
          .eq("category_key", reading.category_key)
          .eq("topic_key", reading.topic_key)
          .eq("subtopic_key", "_all")
      ),

    () =>
      run(
        supabase
          .from("tarot_card_sequence_meanings_prod")
          .select("*")
          .eq("spread_key", reading.spread_key)
          .eq("category_key", reading.category_key)
          .eq("topic_key", "_all")
          .eq("subtopic_key", "_all")
      ),

    () =>
      roleKey
        ? run(
            supabase
              .from("tarot_card_sequence_meanings_prod")
              .select("*")
              .eq("spread_key", reading.spread_key)
              .eq("role_key", roleKey)
              .eq("category_key", "_role")
              .eq("topic_key", "_role")
              .eq("subtopic_key", "_role")
          )
        : null,

    () =>
      run(
        supabase
          .from("tarot_card_sequence_meanings_prod")
          .select("*")
          .eq("spread_key", reading.spread_key)
          .is("category_key", null)
          .is("topic_key", null)
          .is("subtopic_key", null)
          .is("role_key", null)
      ),
  ];

  for (const build of candidates) {
    const data = await build();
    if (data) return data;
  }

  return null;
}

async function findStoryPattern(params: {
  supabase: any;
  reading: any;
  flowType: string;
  roleKey?: string | null;
}) {
  const { supabase, reading, flowType, roleKey } = params;

  async function run(query: any) {
    const result = await query
      .eq("flow_type", flowType)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);
    return result.data ?? null;
  }

  const candidates: Array<() => Promise<any> | null> = [
    () =>
      run(
        supabase
          .from("tarot_spread_story_patterns_prod")
          .select("*")
          .eq("spread_key", reading.spread_key)
          .eq("category_key", reading.category_key)
          .eq("topic_key", reading.topic_key)
          .eq("subtopic_key", "_all")
      ),

    () =>
      run(
        supabase
          .from("tarot_spread_story_patterns_prod")
          .select("*")
          .eq("spread_key", reading.spread_key)
          .eq("category_key", reading.category_key)
          .eq("topic_key", "_all")
          .eq("subtopic_key", "_all")
      ),

    () =>
      roleKey
        ? run(
            supabase
              .from("tarot_spread_story_patterns_prod")
              .select("*")
              .eq("spread_key", reading.spread_key)
              .eq("role_key", roleKey)
              .eq("category_key", "_role")
              .eq("topic_key", "_role")
              .eq("subtopic_key", "_role")
          )
        : null,

    () =>
      run(
        supabase
          .from("tarot_spread_story_patterns_prod")
          .select("*")
          .eq("spread_key", "_all")
          .eq("category_key", reading.category_key)
          .eq("topic_key", reading.topic_key)
          .eq("subtopic_key", "_all")
      ),

    () =>
      run(
        supabase
          .from("tarot_spread_story_patterns_prod")
          .select("*")
          .eq("spread_key", reading.spread_key)
          .is("category_key", null)
          .is("topic_key", null)
          .is("subtopic_key", null)
          .is("role_key", null)
      ),
  ];

  for (const build of candidates) {
    const data = await build();
    if (data) return data;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const readingKey = body?.reading_key;

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

    const supportedSpreadKeys = ["three_card", "celtic_cross", "horoscope"];

    if (!supportedSpreadKeys.includes(reading.spread_key)) {
      return jsonUtf8(
        {
          ok: false,
          error: "compose_v2 supports only three_card, celtic_cross, horoscope",
          spread_key: reading.spread_key,
        },
        400
      );
    }

    const usageType = reading.usage_type ?? "default";

    const topicRole = await resolveTopicRoleForComposeV2({
      supabase,
      reading,
    });

    const roleKey = topicRole?.role_key ?? null;

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

    const normalizedReadingCards = readingCards.map((card) => {
      const positionName =
        positionNameMap.get(Number(card.position_no)) ??
        card.position_name ??
        `ポジション${card.position_no}`;

      return {
        ...card,
        position_name: positionName,
      };
    });

    const cardBlocks = normalizedReadingCards.map((card) => {
      const title = `■ ${card.position_name}\n${card.card_name}｜${card.orientation_name}`;
      const bodyText =
        card.position_adjusted_text ||
        normalizeFallbackText(card.interpretation_text, card.position_name);

      return joinBlocks([title, bodyText]);
    });

    const cardKeys = normalizedReadingCards.map((card) => card.card_key);

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
      (cardMasters ?? []).map((card: any) => [card.card_key, card])
    );

    const cardsWithScores: CardWithScore[] = normalizedReadingCards.map((card) => {
      const master = masterMap.get(card.card_key) as any;

      const energyScore =
        card.orientation === "upright"
          ? master?.energy_score_upright ?? 0
          : master?.energy_score_reversed ?? 0;

      return {
        position_no: Number(card.position_no),
        position_name: card.position_name,
        card_key: card.card_key,
        card_name: card.card_name,
        orientation: card.orientation,
        orientation_name: card.orientation_name,
        energy_score: energyScore,
        flow_tags: master?.flow_tags ?? [],
      };
    });

    const positionRoleMap = await loadPositionRoleMap({
      supabase,
      spreadKey: reading.spread_key,
    });

    const cardsWithRoles = attachPositionRoles({
      cardsWithScores,
      positionRoleMap,
    });

    const timelineTargetCards = cardsWithRoles.filter((card) =>
      ["past", "present", "future"].includes(card.position_role ?? "")
    );

    let flowType: string | null = null;

    if (reading.spread_key === "three_card") {
      const sorted = ["past", "present", "future"]
        .map((role) =>
          cardsWithRoles.find((card) => card.position_role === role)
        )
        .filter(Boolean) as CardWithScore[];

      flowType =
        sorted.length === 3
          ? judgeThreeCardFlow(sorted.map((card) => card.energy_score))
          : judgeGeneralFlow(
              cardsWithScores
                .slice()
                .sort((a, b) => Number(a.position_no) - Number(b.position_no))
                .map((card) => card.energy_score)
            );
    } else if (reading.spread_key === "celtic_cross") {
      flowType = judgeCelticCrossFlow(cardsWithScores);
    } else if (reading.spread_key === "horoscope") {
      flowType = judgeGeneralFlow(
        cardsWithScores
          .slice()
          .sort((a, b) => Number(a.position_no) - Number(b.position_no))
          .map((card) => card.energy_score)
      );
    }

    let sequenceMeaning: any = null;
    let storyPattern: any = null;

    let timelinePairFlows: any[] = [];
    let flowNarrativeBlocks: string[] = [];

    let celticInnerPairReading: any | null = null;
    let celticInnerPairBlocks: string[] = [];

    if (flowType) {
      sequenceMeaning = await findSequenceMeaning({
        supabase,
        reading,
        flowType,
        roleKey,
      });

      storyPattern = await findStoryPattern({
        supabase,
        reading,
        flowType,
        roleKey,
      });

      if (
        reading.spread_key === "three_card" ||
        reading.spread_key === "celtic_cross"
      ) {
        timelinePairFlows = await buildTimelinePairFlows({
          supabase,
          reading,
          cardsWithRoles,
        });

        flowNarrativeBlocks =
          buildTimelinePairFlowNarrative(timelinePairFlows);
      }

      if (reading.spread_key === "celtic_cross") {
        celticInnerPairReading = await buildCelticInnerPairReading({
          supabase,
          reading,
          cardsWithScores,
        });

        celticInnerPairBlocks =
          buildCelticInnerPairNarrative(celticInnerPairReading);
      }
    }

    const balanceCardKeys = cardsWithRoles.map((card) => card.card_key);

    const cardMasterForBalanceMap = await loadCardMasterForBalance({
      supabase,
      cardKeys: balanceCardKeys,
    });

    const cardStatesForBalanceMap = await loadCardStatesForBalance({
      supabase,
      cardKeys: balanceCardKeys,
    });

    const cardsForBalance = attachBalanceMetadata({
      cardsWithRoles,
      cardMasterMap: cardMasterForBalanceMap,
      cardStateMap: cardStatesForBalanceMap,
    });

    const spreadBalanceEvaluation = evaluateSpreadBalance({
      spreadKey: reading.spread_key,
      usageType,
      cards: cardsForBalance,
    });

    const title = `■ ${reading.topic_name ?? reading.category_name}`;

    const shouldShowMiddleText =
      Boolean(storyPattern?.middle_text) &&
      !sequenceMeaning?.sequence_meaning_long;

    const shouldShowClosingText =
      Boolean(storyPattern?.closing_text) &&
      !sequenceMeaning?.sequence_meaning_long;

    const overallText = joinBlocks([
      storyPattern?.opening_text,
      ...flowNarrativeBlocks,
      ...celticInnerPairBlocks,
      ...spreadBalanceEvaluation.summary_blocks,
      sequenceMeaning?.sequence_meaning_long,
      shouldShowMiddleText ? storyPattern?.middle_text : null,
      shouldShowClosingText ? storyPattern?.closing_text : null,
    ]);

    const summaryText =
      storyPattern?.summary_text ||
      sequenceMeaning?.sequence_meaning_short ||
      "";

    const adviceText =
      storyPattern?.advice_text ||
      sequenceMeaning?.advice_text ||
      "";

    const finalReadingText = joinBlocks([
      title,
      ...cardBlocks,
      "■ 全体鑑定",
      overallText,
      summaryText ? `■ まとめ\n${summaryText}` : null,
      adviceText ? `■ アドバイス\n${adviceText}` : null,
    ]);

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("tarot_readings_prod")
      .update({
        final_reading_text: finalReadingText,
        summary_text: summaryText,
        advice_text: adviceText,
        status: "completed",
        updated_at: now,
      })
      .eq("reading_key", readingKey);

    if (updateError) {
      return jsonUtf8({ ok: false, error: updateError.message }, 500);
    }

    return jsonUtf8({
      ok: true,
      reading_key: readingKey,
      status: "completed",
      spread_key: reading.spread_key,
      spread_name: reading.spread_name,
      usage_type: usageType,
      category_key: reading.category_key,
      topic_key: reading.topic_key,
      role_key: roleKey,
      role_name: topicRole?.role_name ?? null,
      flow_type: flowType,
      timeline_scores: timelineTargetCards.map((card) => ({
        position_no: card.position_no,
        position_name: card.position_name,
        position_role: card.position_role,
        energy_score: card.energy_score,
      })),
      timeline_pair_flows: timelinePairFlows,
      visible_flow_narratives: flowNarrativeBlocks,
      celtic_inner_pair_reading: celticInnerPairReading,
      celtic_inner_pair_blocks: celticInnerPairBlocks,
      spread_balance_evaluation: spreadBalanceEvaluation,
      sequence_meaning: sequenceMeaning,
      story_pattern: storyPattern,
      final_reading_text: finalReadingText,
      summary_text: summaryText,
      advice_text: adviceText,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}