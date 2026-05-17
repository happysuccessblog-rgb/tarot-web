import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SummaryCard = {
  position_no?: number;
  position_name?: string;
  card_key?: string;
  card_name?: string;
  orientation?: string;
  orientation_name?: string;
  interpretation_text?: string;
};

type ReadingSummaryBody = {
  category_key?: string;
  topic_key?: string;
  subtopic_key?: string;
  spread_key?: string;
  cards?: SummaryCard[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReadingSummaryBody;

    if (!body.category_key || !body.cards || body.cards.length === 0) {
      return NextResponse.json(
        { error: "category_key and cards are required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let storyQuery = supabase
      .from("tarot_spread_story_patterns")
      .select(
        `
        id,
        spread_key,
        category_key,
        topic_key,
        subtopic_key,
        pattern_name,
        opening_text,
        middle_text,
        closing_text,
        summary_text,
        advice_text,
        is_active
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

    const { data: storyPattern, error } =
      await storyQuery.maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const cardsSummary = body.cards.map((card) => ({
      position_no: card.position_no ?? null,
      position_name: card.position_name ?? "",
      card_key: card.card_key ?? "",
      card_name: card.card_name ?? "",
      orientation: card.orientation ?? "",
      orientation_name: card.orientation_name ?? "",
      interpretation_text: card.interpretation_text ?? "",
    }));

    return NextResponse.json({
      ok: true,

      category_key: body.category_key,
      topic_key: body.topic_key ?? null,
      subtopic_key: body.subtopic_key ?? null,
      spread_key: body.spread_key ?? null,

      story_pattern: storyPattern
        ? {
      pattern_name: storyPattern.pattern_name,
      opening_text: storyPattern.opening_text,
      middle_text: storyPattern.middle_text,
      closing_text: storyPattern.closing_text,
      summary_text: storyPattern.summary_text,
      advice_text: storyPattern.advice_text,
          }
        : null,

      cards: cardsSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}