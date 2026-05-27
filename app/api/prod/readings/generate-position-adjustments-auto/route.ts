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

function pickFirstSentence(text: string) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const match = clean.match(/^.*?[。！？]/);
  return (match?.[0] ?? clean).trim();
}

function removeCardLead(text: string) {
  return (text ?? "")
    .replace(/^.+?の正位置は、/, "")
    .replace(/^.+?の逆位置は、/, "")
    .replace(/^.+?は、/, "")
    .trim();
}

function normalizeSentenceEnd(text: string) {
  const clean = (text ?? "").trim();
  if (!clean) return "";

  if (/[。！？]$/.test(clean)) return clean;
  return `${clean}。`;
}

function neutralizeNonEmotionText(text: string) {
  return (text ?? "")
    // nine_card emotion専用テンプレの完全置換を先に処理
    .replace(/相手の過去の表面意識では、相手が過去に表面的に意識していた気持ちが表れています。/g, "過去の表面的な流れには、当時の状況や反応が表れています。")
    .replace(/相手の現在の表面意識では、相手が現在表面的に意識している気持ちが表れています。/g, "現在の表面的な流れには、今の状況や反応が表れています。")
    .replace(/相手の未来の表面意識では、相手が未来に表面的に意識しやすい気持ちが表れています。/g, "未来の表面的な流れには、これから表れやすい状況の変化が示されています。")
    .replace(/相手の過去の中間意識では、相手の過去の中間的な感情や心理が表れています。/g, "過去の中間的な流れには、当時の状況を支えていた内側の要因が表れています。")
    .replace(/相手の現在の中間意識では、相手の現在の中間的な感情や心理が表れています。/g, "現在の中間的な流れには、今の状況を支えている内側の要因が表れています。")
    .replace(/相手の未来の中間意識では、相手の未来の中間的な感情や心理が表れています。/g, "未来の中間的な流れには、これから状況を動かす内側の要因が表れています。")
    .replace(/相手の過去の潜在意識では、相手の過去の潜在意識が表れています。/g, "過去の深い要因には、当時の流れに影響していた見えにくい要素が表れています。")
    .replace(/相手の現在の潜在意識では、相手の現在の潜在意識が表れています。/g, "現在の深い要因には、今の流れに影響している見えにくい要素が表れています。")
    .replace(/相手の未来の潜在意識では、相手の未来の潜在意識が表れています。/g, "未来の深い要因には、これからの流れに影響しやすい見えにくい要素が表れています。")

    // 「では、」が前段で付かないパターンも補助
    .replace(/相手が過去に表面的に意識していた気持ちが表れています。/g, "過去の表面的な流れには、当時の状況や反応が表れています。")
    .replace(/相手が現在表面的に意識している気持ちが表れています。/g, "現在の表面的な流れには、今の状況や反応が表れています。")
    .replace(/相手が未来に表面的に意識しやすい気持ちが表れています。/g, "未来の表面的な流れには、これから表れやすい状況の変化が示されています。")
    .replace(/相手の過去の中間的な感情や心理が表れています。/g, "過去の中間的な流れには、当時の状況を支えていた内側の要因が表れています。")
    .replace(/相手の現在の中間的な感情や心理が表れています。/g, "現在の中間的な流れには、今の状況を支えている内側の要因が表れています。")
    .replace(/相手の未来の中間的な感情や心理が表れています。/g, "未来の中間的な流れには、これから状況を動かす内側の要因が表れています。")
    .replace(/相手の過去の潜在意識が表れています。/g, "過去の深い要因には、当時の流れに影響していた見えにくい要素が表れています。")
    .replace(/相手の現在の潜在意識が表れています。/g, "現在の深い要因には、今の流れに影響している見えにくい要素が表れています。")
    .replace(/相手の未来の潜在意識が表れています。/g, "未来の深い要因には、これからの流れに影響しやすい見えにくい要素が表れています。")

    // 汎用単語置換は最後
    .replace(/相手の心に/g, "")
    .replace(/相手の気持ち/g, "状況の流れ")
    .replace(/相手側の気持ち/g, "周囲の状況")
    .replace(/気持ちや距離感/g, "流れやバランス")
    .replace(/気持ちの区切り/g, "流れの区切り")
    .replace(/気持ちが曖昧/g, "状況が曖昧")
    .replace(/前向きな関係へ/g, "前向きな流れへ")
    .replace(/関係の揺れ/g, "状況の揺れ")
    .replace(/関係に影響/g, "状況に影響")
    .replace(/関係性/g, "状況")
    .replace(/関係/g, "状況");
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

function buildNaturalPositionText(params: {
  spreadKey: string;
  positionName: string;
  baseSentence: string;
  adjustmentOutput: string;
  roleKey?: string | null;
}) {
  const { spreadKey, positionName, baseSentence, adjustmentOutput, roleKey } = params;

  const cleanBase = removeCardLead(baseSentence);
  const cleanAdjustment = removeCardLead(adjustmentOutput);

  const source =
    spreadKey === "nine_card"
      ? cleanBase || cleanAdjustment
      : roleKey && roleKey !== "emotion"
        ? cleanBase || cleanAdjustment
        : cleanAdjustment || cleanBase;

  if (!source) {
    return `${positionName}では、テーマに沿った流れが表れています。`;
  }

  const finalSource =
    roleKey && roleKey !== "emotion"
      ? neutralizeNonEmotionText(source)
      : source;

  if (roleKey && roleKey !== "emotion" && /^(過去|現在|未来)の/.test(finalSource)) {
    return normalizeSentenceEnd(finalSource);
  }

  if (
    positionName.includes("過去") ||
    positionName === "1月" ||
    positionName === "2月" ||
    positionName === "3月" ||
    positionName === "4月" ||
    positionName === "5月" ||
    positionName === "6月" ||
    positionName === "7月" ||
    positionName === "8月" ||
    positionName === "9月" ||
    positionName === "10月" ||
    positionName === "11月" ||
    positionName === "12月"
  ) {
    return normalizeSentenceEnd(`${positionName}では、${finalSource}`);
  }

  if (
    positionName.includes("現在") ||
    positionName.includes("現状") ||
    positionName.includes("基本状態")
  ) {
    return normalizeSentenceEnd(`現在の状況としては、${finalSource}`);
  }

  if (
    positionName.includes("未来") ||
    positionName.includes("結果") ||
    positionName.includes("結論") ||
    positionName.includes("総合")
  ) {
    return normalizeSentenceEnd(`これからの流れとしては、${finalSource}`);
  }

  if (
    positionName.includes("障害") ||
    positionName.includes("試練") ||
    positionName.includes("問題") ||
    positionName.includes("原因")
  ) {
    return normalizeSentenceEnd(`流れを妨げている要素としては、${finalSource}`);
  }

  if (
    positionName.includes("潜在") ||
    positionName.includes("見えない影響") ||
    positionName.includes("秘密")
  ) {
    return normalizeSentenceEnd(`まだ表面化していない部分では、${finalSource}`);
  }

  return normalizeSentenceEnd(`${positionName}では、${finalSource}`);
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

    const results = [];

    for (const card of cards ?? []) {
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

      let { data: adjustments, error: adjustmentError } = await supabase
        .from("tarot_spread_position_adjustments_prod")
        .select(`
          adjustment_role,
          adjustment_text,
          adjustment_prompt,
          adjustment_output
        `)
        .eq("spread_key", reading.spread_key)
        .eq("usage_type", usageType)
        .eq("position_no", card.position_no)
        .eq("category_key", reading.category_key)
        .eq("topic_key", reading.topic_key)
        .eq("subtopic_key", reading.subtopic_key)
        .eq("is_active", true);

      if (adjustmentError) {
        return jsonUtf8({ ok: false, error: adjustmentError.message }, 500);
      }

      if ((!adjustments || adjustments.length === 0) && usageType !== "default") {
        const fallback = await supabase
          .from("tarot_spread_position_adjustments_prod")
          .select(`
            adjustment_role,
            adjustment_text,
            adjustment_prompt,
            adjustment_output
          `)
          .eq("spread_key", reading.spread_key)
          .eq("usage_type", "default")
          .eq("position_no", card.position_no)
          .eq("category_key", reading.category_key)
          .eq("topic_key", reading.topic_key)
          .eq("subtopic_key", reading.subtopic_key)
          .eq("is_active", true);

        if (fallback.error) {
          return jsonUtf8({ ok: false, error: fallback.error.message }, 500);
        }

        adjustments = fallback.data ?? [];
      }

      const mainAdjustment =
        (adjustments ?? []).find((item: any) => item.adjustment_role === "main") ??
        (adjustments ?? [])[0];

      const adjustmentOutput =
        mainAdjustment?.adjustment_output ??
        mainAdjustment?.adjustment_text ??
        "";

      const baseSentence = pickFirstSentence(card.interpretation_text ?? "");

      const positionAdjustedText = buildNaturalPositionText({
        spreadKey: reading.spread_key,
        positionName,
        baseSentence,
        adjustmentOutput,
        roleKey,
      });

      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("tarot_reading_cards_prod")
        .update({
          position_name: positionName,
          position_adjusted_text: positionAdjustedText,
          updated_at: now,
        })
        .eq("reading_key", readingKey)
        .eq("position_no", card.position_no);

      if (updateError) {
        return jsonUtf8({ ok: false, error: updateError.message }, 500);
      }

      results.push({
        position_no: card.position_no,
        position_name: positionName,
        card_name: card.card_name,
        orientation_name: card.orientation_name,
        role_key: roleKey,
        adjustment_output: adjustmentOutput,
        position_adjusted_text: positionAdjustedText,
      });
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
      role_key: roleKey,
      role_name: subtopicRole?.role_name ?? null,
      success_count: results.length,
      results,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}