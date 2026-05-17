import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type FinalReadingCard = {
  position_no?: number;
  position_name?: string;
  card_key?: string;
  orientation?: string;
  timing_key?: string;
};

type FinalReadingBody = {
  category_key?: string;
  topic_key?: string;
  subtopic_key?: string;
  spread_key?: string;
  spread_name?: string;
  question?: string;
  cards?: FinalReadingCard[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FinalReadingBody;

    if (!body.category_key || !body.cards || body.cards.length === 0) {
      return NextResponse.json(
        { ok: false, error: "category_key and cards are required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const cardSections = [];

    for (const item of body.cards) {
      if (!item.card_key || !item.orientation) {
        cardSections.push({
          found: false,
          position_no: item.position_no ?? null,
          position_name: item.position_name ?? "",
          text: "カード情報が不足しています。",
        });
        continue;
      }

      let interpretationQuery = supabase
        .from("tarot_interpretation_texts")
        .select(
          `
          card_key,
          card_name,
          orientation,
          orientation_name,
          category_name,
          topic_name,
          subtopic_name,
          timing_name,
          interpretation_text
        `
        )
        .eq("card_key", item.card_key)
        .eq("orientation", item.orientation)
        .eq("category_key", body.category_key)
        .eq("text_role", "main")
        .eq("length_type", "normal")
        .eq("is_active", true);

      if (body.topic_key) {
        interpretationQuery = interpretationQuery.eq("topic_key", body.topic_key);
      } else {
        interpretationQuery = interpretationQuery.is("topic_key", null);
      }

      if (body.subtopic_key) {
        interpretationQuery = interpretationQuery.eq(
          "subtopic_key",
          body.subtopic_key
        );
      } else {
        interpretationQuery = interpretationQuery.is("subtopic_key", null);
      }

      if (item.timing_key) {
        interpretationQuery = interpretationQuery.eq("timing_key", item.timing_key);
      } else {
        interpretationQuery = interpretationQuery.is("timing_key", null);
      }

      const { data: interpretation, error: interpretationError } =
        await interpretationQuery.maybeSingle();

      if (interpretationError || !interpretation) {
        cardSections.push({
          found: false,
          position_no: item.position_no ?? null,
          position_name: item.position_name ?? "",
          card_key: item.card_key,
          orientation: item.orientation,
          text: "該当するカード解釈がまだ登録されていません。",
        });
        continue;
      }

      let positionAdjustment = "";

      if (body.spread_key && item.position_no) {
        let adjustmentQuery = supabase
          .from("tarot_spread_position_adjustments")
          .select("adjustment_text")
          .eq("spread_key", body.spread_key)
          .eq("position_no", item.position_no)
          .eq("category_key", body.category_key)
          .eq("adjustment_role", "main")
          .eq("is_active", true);

        if (body.topic_key) {
          adjustmentQuery = adjustmentQuery.eq("topic_key", body.topic_key);
        } else {
          adjustmentQuery = adjustmentQuery.is("topic_key", null);
        }

        if (body.subtopic_key) {
          adjustmentQuery = adjustmentQuery.eq(
            "subtopic_key",
            body.subtopic_key
          );
        } else {
          adjustmentQuery = adjustmentQuery.is("subtopic_key", null);
        }

        const { data: adjustment } = await adjustmentQuery.maybeSingle();

        positionAdjustment = adjustment?.adjustment_text ?? "";
      }

      const title = `${item.position_no ?? ""}. ${
        item.position_name ?? ""
      }｜${interpretation.card_name}（${interpretation.orientation_name}）`;

      const sectionText = [
        `【${title}】`,
        positionAdjustment ? `この位置は、${positionAdjustment}` : "",
        interpretation.interpretation_text,
      ]
        .filter(Boolean)
        .join("\n\n");

      cardSections.push({
        found: true,
        position_no: item.position_no ?? null,
        position_name: item.position_name ?? "",
        card_key: interpretation.card_key,
        card_name: interpretation.card_name,
        orientation: interpretation.orientation,
        orientation_name: interpretation.orientation_name,
        timing_name: interpretation.timing_name,
        position_adjustment: positionAdjustment,
        interpretation_text: interpretation.interpretation_text,
        text: sectionText,
      });
    }

    let storyQuery = supabase
      .from("tarot_spread_story_patterns")
      .select(
        `
        pattern_name,
        opening_text,
        middle_text,
        closing_text,
        summary_text,
        advice_text
      `
      )
      .eq("category_key", body.category_key)
      .eq("is_active", true);

    if (body.spread_key) {
      storyQuery = storyQuery.eq("spread_key", body.spread_key);
    } else {
      storyQuery = storyQuery.is("spread_key", null);
    }

    if (body.topic_key) {
      storyQuery = storyQuery.eq("topic_key", body.topic_key);
    } else {
      storyQuery = storyQuery.is("topic_key", null);
    }

    if (body.subtopic_key) {
      storyQuery = storyQuery.eq("subtopic_key", body.subtopic_key);
    } else {
      storyQuery = storyQuery.is("subtopic_key", null);
    }

    const { data: storyPattern } = await storyQuery.maybeSingle();

    const openingText =
      storyPattern?.opening_text ||
      "今回の鑑定では、出たカード全体から現在の状況と今後の流れを読み取っていきます。";

    const summaryText =
      storyPattern?.summary_text ||
      "全体としては、カードごとの意味を丁寧に見ながら、今の状況と今後の可能性を整理する流れです。";

    const adviceText =
      storyPattern?.advice_text ||
      "今はカードが示す流れを参考にしながら、焦らず自然な行動を心がけることが大切です。";

    const closingText =
      storyPattern?.closing_text ||
      "今回の鑑定が、これからの行動を考えるためのひとつの手がかりになれば幸いです。";

    const finalText = [
      "【鑑定結果】",
      body.question ? `ご相談内容：${body.question}` : "",
      body.spread_name ? `使用スプレッド：${body.spread_name}` : "",
      "",
      "【全体の導入】",
      openingText,
      "",
      "【各カードの読み取り】",
      cardSections.map((section) => section.text).join("\n\n"),
      "",
      "【全体の流れ】",
      storyPattern?.middle_text ?? summaryText,
      "",
      "【総合診断】",
      summaryText,
      "",
      "【行動アドバイス】",
      adviceText,
      "",
      "【最終メッセージ】",
      closingText,
    ]
      .filter((value) => value !== "")
      .join("\n\n");

    return NextResponse.json({
      ok: true,
      category_key: body.category_key,
      topic_key: body.topic_key ?? null,
      subtopic_key: body.subtopic_key ?? null,
      spread_key: body.spread_key ?? null,
      spread_name: body.spread_name ?? null,
      question: body.question ?? "",
      story_pattern: storyPattern ?? null,
      card_sections: cardSections,
      final_text: finalText,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}