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


function normalizeFallbackText(text: string | null | undefined, positionName: string | null | undefined) {
  const value = (text ?? "").trim();

  if (!value.startsWith("[FALLBACK]")) {
    return value;
  }

  const raw = value.replace("[FALLBACK]", "").trim();
  const name = positionName ?? "";

  if (!raw) return "";

  if (name.includes("過去")) {
    return `これまでの流れとしては、${raw}`;
  }

  if (name.includes("近未来")) {
    return `近い未来の流れとしては、${raw}`;
  }

  if (name.includes("未来") || name.includes("結果") || name.includes("最終")) {
    return `今後の流れとしては、${raw}`;
  }

  if (name.includes("現在") || name.includes("現状")) {
    return `現在の状況としては、${raw}`;
  }

  if (name.includes("潜在") || name.includes("本音")) {
    return `表には出にくい部分としては、${raw}`;
  }

  if (name.includes("障害") || name.includes("問題")) {
    return `今の課題としては、${raw}`;
  }

  if (name.includes("アドバイス") || name.includes("助言")) {
    return `今必要な意識としては、${raw}`;
  }

  if (name.includes("Yes") || name.includes("No")) {
    return `判断の流れとしては、${raw}`;
  }

  if (name.includes("選択肢A") || name.includes("Aを選んだ場合")) {
    return `選択肢Aの流れとしては、${raw}`;
  }

  if (name.includes("選択肢B") || name.includes("Bを選んだ場合")) {
    return `選択肢Bの流れとしては、${raw}`;
  }

  return raw;
}

function joinBlocks(blocks: Array<string | null | undefined>) {
  return blocks
    .map((text) => (text ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
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
    case "horoscope_monthly":
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

    case "horoscope_monthly":
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

async function resolveSubtopicRole(params: {
  supabase: any;
  reading: any;
}) {
  const { supabase, reading } = params;

  const exactRole = await supabase
    .from("tarot_subtopic_roles_prod")
    .select("role_key, role_name")
    .eq("category_key", reading.category_key)
    .eq("topic_key", reading.topic_key)
    .eq("subtopic_key", reading.subtopic_key)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (exactRole.error) throw new Error(exactRole.error.message);
  if (exactRole.data?.role_key) return exactRole.data;

  const topicRole = await supabase
    .from("tarot_subtopic_roles_prod")
    .select("role_key, role_name")
    .eq("topic_key", reading.topic_key)
    .eq("subtopic_key", reading.subtopic_key)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (topicRole.error) throw new Error(topicRole.error.message);
  if (topicRole.data?.role_key) return topicRole.data;

  const subtopicRole = await supabase
    .from("tarot_subtopic_roles_prod")
    .select("role_key, role_name")
    .eq("subtopic_key", reading.subtopic_key)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (subtopicRole.error) throw new Error(subtopicRole.error.message);

  return subtopicRole.data ?? null;
}

function getPatternFlowType(pairFlow: any) {
  return pairFlow?.pair_flow_pattern?.flow_type ?? null;
}

function getPatternPriority(pairFlow: any) {
  const priority = pairFlow?.pair_flow_pattern?.priority;
  return typeof priority === "number" ? priority : 9999;
}

function hasPattern(pairFlow: any) {
  return Boolean(pairFlow?.pair_flow_pattern?.pair_meaning_short);
}

function pairKey(pairFlow: any) {
  return `${pairFlow.from_position_no}-${pairFlow.to_position_no}`;
}

function isFinalLikePositionName(positionName: string) {
  return (
    positionName.includes("結果") ||
    positionName.includes("結論") ||
    positionName.includes("最終") ||
    positionName.includes("達成") ||
    positionName.includes("総合") ||
    positionName.includes("アドバイス")
  );
}

function compressConsecutiveSameFlowType(pairFlows: any[]) {
  const compressed: any[] = [];

  for (const pairFlow of pairFlows) {
    const currentFlowType = getPatternFlowType(pairFlow);
    const previousFlowType = getPatternFlowType(compressed[compressed.length - 1]);

    if (currentFlowType && previousFlowType && currentFlowType === previousFlowType) {
      continue;
    }

    compressed.push(pairFlow);
  }

  return compressed;
}

function limitUniqueFlowTypes(pairFlows: any[], maxCount: number) {
  const result: any[] = [];
  const usedFlowTypes = new Set<string>();

  const sorted = [...pairFlows].sort((a, b) => {
    const aFinal = isFinalLikePositionName(a.to_position_name ?? "") ? 0 : 1;
    const bFinal = isFinalLikePositionName(b.to_position_name ?? "") ? 0 : 1;

    if (aFinal !== bFinal) return aFinal - bFinal;

    return getPatternPriority(a) - getPatternPriority(b);
  });

  for (const pairFlow of sorted) {
    const flowType = getPatternFlowType(pairFlow) ?? pairKey(pairFlow);

    if (usedFlowTypes.has(flowType)) continue;

    result.push(pairFlow);
    usedFlowTypes.add(flowType);

    if (result.length >= maxCount) break;
  }

  return result.sort((a, b) => a.from_position_no - b.from_position_no);
}

function filterByAllowedPairs(pairFlows: any[], allowedPairs: number[][]) {
  const allowed = new Set(allowedPairs.map(([from, to]) => `${from}-${to}`));

  return pairFlows.filter((pairFlow) =>
    allowed.has(`${pairFlow.from_position_no}-${pairFlow.to_position_no}`)
  );
}

function buildGroupedFlowSummary(pairFlows: any[]) {
  const activePairFlows = pairFlows.filter(hasPattern);

  if (activePairFlows.length === 0) return "";

  const forwardFlows = activePairFlows.filter(
    (pairFlow) => getPatternFlowType(pairFlow) === "forward_flow"
  );

  const recoveryFlows = activePairFlows.filter(
    (pairFlow) => getPatternFlowType(pairFlow) === "recovery_flow"
  );

  const otherFlows = activePairFlows.filter((pairFlow) => {
    const flowType = getPatternFlowType(pairFlow);
    return flowType !== "forward_flow" && flowType !== "recovery_flow";
  });

  const blocks: string[] = [];

  if (forwardFlows.length > 0) {
    const fromNames = forwardFlows
      .map((pairFlow) => pairFlow.from_position_name)
      .filter(Boolean)
      .join("、");

    blocks.push(
      `${fromNames}は、最終的な流れを前向きに支える要素として働きやすい状態です。`
    );
  }

  if (recoveryFlows.length > 0) {
    const fromNames = recoveryFlows
      .map((pairFlow) => pairFlow.from_position_name)
      .filter(Boolean)
      .join("、");

    blocks.push(
      `${fromNames}には、まだ不安や停滞が残りやすい一方で、最終的には回復へ向かう流れも見えています。`
    );
  }

  for (const pairFlow of limitUniqueFlowTypes(otherFlows, 2)) {
    blocks.push(
      `${pairFlow.from_position_name}から${pairFlow.to_position_name}にかけては、${pairFlow.pair_flow_pattern.pair_meaning_short}`
    );
  }

  return blocks.join("\n\n");
}

function buildVisiblePairFlows(params: {
  spreadKey: string;
  usageType: string;
  pairFlows: any[];
}) {
  const { spreadKey, usageType, pairFlows } = params;

  const withPatterns = pairFlows.filter(hasPattern);

  if (withPatterns.length === 0) return [];

  if (spreadKey === "star_of_david") return [];

  if (
    spreadKey === "horoscope_monthly" ||
    (spreadKey === "horoscope" && usageType === "monthly_fortune")
  ) {
    return [];
  }

  if (spreadKey === "tree_of_life") return [];

  if (spreadKey === "nine_card") {
    const horizontalPairs = filterByAllowedPairs(withPatterns, [
      [1, 2],
      [2, 3],
      [4, 5],
      [5, 6],
      [7, 8],
      [8, 9],
    ]);

    return limitUniqueFlowTypes(
      compressConsecutiveSameFlowType(horizontalPairs),
      3
    );
  }

  if (spreadKey === "v_spread") {
    const routeA = filterByAllowedPairs(withPatterns, [
      [1, 2],
      [2, 4],
      [4, 6],
    ]);

    const routeB = filterByAllowedPairs(withPatterns, [
      [1, 3],
      [3, 5],
      [5, 7],
    ]);

    return [
      ...routeA,
      ...routeB,
    ];
  }

  if (spreadKey === "two_choices") {
    const routeA = filterByAllowedPairs(withPatterns, [
      [1, 2],
      [2, 4],
    ]);

    const routeB = filterByAllowedPairs(withPatterns, [
      [1, 3],
      [3, 5],
    ]);

    return [
      ...routeA,
      ...routeB,
    ];
  }

  if (spreadKey === "pyramid") {
    const mainAxis = filterByAllowedPairs(withPatterns, [
      [1, 2],
      [2, 3],
      [3, 6],
    ]);

    return limitUniqueFlowTypes(
      compressConsecutiveSameFlowType(mainAxis),
      2
    );
  }

  if (spreadKey === "three_card") {
    return limitUniqueFlowTypes(
      compressConsecutiveSameFlowType(withPatterns),
      2
    );
  }

  return limitUniqueFlowTypes(
    compressConsecutiveSameFlowType(withPatterns),
    3
  );
}

function buildFlowNarratives(params: {
  spreadKey: string;
  usageType: string;
  pairFlows: any[];
}) {
  const { spreadKey, usageType, pairFlows } = params;

  if (spreadKey === "tree_of_life") {
    const groupedSummary = buildGroupedFlowSummary(pairFlows);
    return groupedSummary ? [`■ 流れの変化\n${groupedSummary}`] : [];
  }

if (spreadKey === "v_spread") {
  const visiblePairFlows = buildVisiblePairFlows({
    spreadKey,
    usageType,
    pairFlows,
  });

  const routeA = visiblePairFlows.filter(
    (f) =>
      f.from_position_name.includes("選択肢A") ||
      f.to_position_name.includes("選択肢A")
  );

  const routeB = visiblePairFlows.filter(
    (f) =>
      f.from_position_name.includes("選択肢B") ||
      f.to_position_name.includes("選択肢B")
  );

  const formatRoute = (title: string, flows: any[]) => {
    if (flows.length === 0) return null;

    return [
      `【${title}】`,
      ...flows.map(
        (pairFlow) =>
          `${pairFlow.from_position_name}から${pairFlow.to_position_name}にかけては、${pairFlow.pair_flow_pattern.pair_meaning_short}`
      ),
    ].join("\n");
  };

  const sections = [
    formatRoute("選択肢Aの流れ", routeA),
    formatRoute("選択肢Bの流れ", routeB),
  ].filter(Boolean);

  return sections.length > 0
    ? [`■ 流れの変化\n${sections.join("\n\n")}`]
    : [];
}

if (spreadKey === "two_choices") {
  const visiblePairFlows = buildVisiblePairFlows({
    spreadKey,
    usageType,
    pairFlows,
  });

  const routeA = visiblePairFlows.filter(
    (f) =>
      f.from_position_name.includes("Aを選んだ場合") ||
      f.to_position_name.includes("Aを選んだ場合")
  );

  const routeB = visiblePairFlows.filter(
    (f) =>
      f.from_position_name.includes("Bを選んだ場合") ||
      f.to_position_name.includes("Bを選んだ場合")
  );

  const formatRoute = (title: string, flows: any[]) => {
    if (flows.length === 0) return null;

    return [
      `【${title}】`,
      ...flows.map(
        (pairFlow) =>
          `${pairFlow.from_position_name}から${pairFlow.to_position_name}にかけては、${pairFlow.pair_flow_pattern.pair_meaning_short}`
      ),
    ].join("\n");
  };

  const sections = [
    formatRoute("Aを選んだ場合の流れ", routeA),
    formatRoute("Bを選んだ場合の流れ", routeB),
  ].filter(Boolean);

  return sections.length > 0
    ? [`■ 流れの変化\n${sections.join("\n\n")}`]
    : [];
}

  if (
    spreadKey === "horoscope_monthly" ||
    (spreadKey === "horoscope" && usageType === "monthly_fortune")
  ) {
    return [];
  }

  const visiblePairFlows = buildVisiblePairFlows({
    spreadKey,
    usageType,
    pairFlows,
  });

  if (visiblePairFlows.length === 0) return [];

  return [
    `■ 流れの変化\n${visiblePairFlows
      .map(
        (pairFlow) =>
          `${pairFlow.from_position_name}から${pairFlow.to_position_name}にかけては、${pairFlow.pair_flow_pattern.pair_meaning_short}`
      )
      .join("\n\n")}`,
  ];
}

async function findPairFlowPattern(params: {
  supabase: any;
  reading: any;
  fromScore: number;
  toScore: number;
  fromPositionNo: number;
  toPositionNo: number;
}) {
  const { supabase, reading, fromScore, toScore, fromPositionNo, toPositionNo, } = params;

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

  if (reading.spread_key === "hexagram") {
    const hexagramSpecific = await buildBaseQuery()
      .is("category_key", null)
      .is("topic_key", null)
      .is("subtopic_key", null)
      .like("pair_flow_key", "hexagram_%");

    if (hexagramSpecific.error) throw new Error(hexagramSpecific.error.message);
    if (hexagramSpecific.data) return hexagramSpecific.data;
  }

    const positionSpecific = await buildBaseQuery()
      .eq("spread_key", reading.spread_key)
      .eq("from_position_no", fromPositionNo)
      .eq("to_position_no", toPositionNo)
      .eq("category_key", "_all")
      .eq("topic_key", "_all")
      .eq("subtopic_key", "_all");

    if (positionSpecific.error) throw new Error(positionSpecific.error.message);
    if (positionSpecific.data) return positionSpecific.data;

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

  let genericQuery = buildBaseQuery()
    .is("category_key", null)
    .is("topic_key", null)
    .is("subtopic_key", null);

  if (reading.spread_key !== "hexagram") {
    genericQuery = genericQuery.not("pair_flow_key", "like", "hexagram_%");
  }

  const generic = await genericQuery;

  if (generic.error) throw new Error(generic.error.message);

  return generic.data ?? null;
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

  const candidates: Array<() => any | null> = [
    () =>
      run(
        supabase
          .from("tarot_card_sequence_meanings_prod")
          .select("*")
          .eq("spread_key", reading.spread_key)
          .eq("category_key", reading.category_key)
          .eq("topic_key", reading.topic_key)
          .eq("subtopic_key", reading.subtopic_key)
      ),

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

  function withRole(query: any) {
    if (roleKey) return query.eq("role_key", roleKey);
    return query.is("role_key", null);
  }

  async function run(query: any) {
    const result = await withRole(query)
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
        .eq("subtopic_key", reading.subtopic_key)
    ),

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
        .eq("subtopic_key", reading.subtopic_key)
    ),

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

    const usageType = reading.usage_type ?? "default";

    const subtopicRole = await resolveSubtopicRole({
      supabase,
      reading,
    });

    const roleKey = subtopicRole?.role_key ?? null;

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

function getRoleBasedPositionName(params: {
  spreadKey: string;
  roleKey?: string | null;
  positionNo: number;
  defaultName: string;
}) {
  const { spreadKey, roleKey, positionNo, defaultName } = params;

  if (spreadKey !== "nine_card") return defaultName;

  if (roleKey === "emotion") return defaultName;

  const generalNineCardNames: Record<number, string> = {
    1: "過去の表面的な流れ",
    2: "現在の表面的な流れ",
    3: "未来の表面的な流れ",
    4: "過去の中間的な流れ",
    5: "現在の中間的な流れ",
    6: "未来の中間的な流れ",
    7: "過去の深い要因",
    8: "現在の深い要因",
    9: "未来の深い要因",
  };

  return generalNineCardNames[positionNo] ?? defaultName;
}

    const normalizedReadingCards = readingCards.map((card) => {
      const basePositionName =
        positionNameMap.get(Number(card.position_no)) ??
        card.position_name ??
        `ポジション${card.position_no}`;

const positionName = getRoleBasedPositionName({
  spreadKey: reading.spread_key,
  roleKey,
  positionNo: Number(card.position_no),
  defaultName: basePositionName,
});

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
      (cardMasters ?? []).map((card) => [card.card_key, card])
    );

    const cardsWithScores = normalizedReadingCards.map((card) => {
      const master = masterMap.get(card.card_key) as any;

      const energyScore =
        card.orientation === "upright"
          ? master?.energy_score_upright ?? 0
          : master?.energy_score_reversed ?? 0;

      return {
        position_no: card.position_no,
        position_name: card.position_name,
        card_key: card.card_key,
        card_name: card.card_name,
        orientation: card.orientation,
        orientation_name: card.orientation_name,
        energy_score: energyScore,
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

    let sequenceMeaning: any = null;
    let storyPattern: any = null;
    const pairFlows: any[] = [];

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

            return { fromCard, toCard };
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

      for (const pair of pairCardPairs) {
        const { fromCard, toCard } = pair;

        const pairFlowPattern = await findPairFlowPattern({
          supabase,
          reading,
          fromScore: fromCard.energy_score,
          toScore: toCard.energy_score,
          fromPositionNo: Number(fromCard.position_no),
          toPositionNo: Number(toCard.position_no),
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

    const flowNarrativeBlocks = buildFlowNarratives({
      spreadKey: reading.spread_key,
      usageType,
      pairFlows,
    });

    const title = `■ ${reading.topic_name ?? reading.category_name}｜${
      reading.subtopic_name ?? "鑑定結果"
    }`;

    const shouldShowMiddleText =
      Boolean(storyPattern?.middle_text) &&
      !sequenceMeaning?.sequence_meaning_long;

    const shouldShowClosingText =
      Boolean(storyPattern?.closing_text) &&
      !sequenceMeaning?.sequence_meaning_long;

    const overallText = joinBlocks([
      storyPattern?.opening_text,
      ...flowNarrativeBlocks,
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
      subtopic_key: reading.subtopic_key,
      role_key: roleKey,
      role_name: subtopicRole?.role_name ?? null,
      flow_type: flowType,
      flow_target_positions: targetPositions,
      flow_scores: scores,
      pair_flow_position_pairs: pairPositionPairs,
      sequence_meaning: sequenceMeaning,
      pair_flows: pairFlows,
      visible_flow_narratives: flowNarrativeBlocks,
      story_pattern: storyPattern,
      final_reading_text: finalReadingText,
      summary_text: summaryText,
      advice_text: adviceText,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}