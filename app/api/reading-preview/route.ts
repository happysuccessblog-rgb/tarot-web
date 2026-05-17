import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReadingPreviewCard = {
  position_no?: number;
  position_name?: string;
  card_key?: string;
  orientation?: string;
  timing_key?: string;
};

type ReadingPreviewBody = {
  category_key?: string;
  topic_key?: string;
  subtopic_key?: string;
  spread_key?: string;
  cards?: ReadingPreviewCard[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReadingPreviewBody;

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

    const results = [];

    for (const item of body.cards) {
      if (!item.card_key || !item.orientation) {
        results.push({
          position_no: item.position_no ?? null,
          position_name: item.position_name ?? "",
          found: false,
          error: "card_key and orientation are required",
        });
        continue;
      }

      let query = supabase
        .from("tarot_interpretation_texts")
        .select(
          `
          card_key,
          card_name,
          orientation,
          orientation_name,
          category_key,
          category_name,
          topic_key,
          topic_name,
          subtopic_key,
          subtopic_name,
          timing_key,
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
        query = query.eq("topic_key", body.topic_key);
      } else {
        query = query.is("topic_key", null);
      }

      if (body.subtopic_key) {
        query = query.eq("subtopic_key", body.subtopic_key);
      } else {
        query = query.is("subtopic_key", null);
      }

      if (item.timing_key) {
        query = query.eq("timing_key", item.timing_key);
      } else {
        query = query.is("timing_key", null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        results.push({
          position_no: item.position_no ?? null,
          position_name: item.position_name ?? "",
          card_key: item.card_key,
          orientation: item.orientation,
          found: false,
          error: error.message,
        });
        continue;
      }

      if (!data) {
        results.push({
          position_no: item.position_no ?? null,
          position_name: item.position_name ?? "",
          card_key: item.card_key,
          orientation: item.orientation,
          timing_key: item.timing_key ?? null,
          found: false,
          message: "No interpretation found",
        });
        continue;
      }

      let positionAdjustment: string | null = null;

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

        const { data: adjustmentData } = await adjustmentQuery.maybeSingle();

        if (adjustmentData?.adjustment_text) {
          positionAdjustment = adjustmentData.adjustment_text;
        }
      }

      results.push({
        position_no: item.position_no ?? null,
        position_name: item.position_name ?? "",
        found: true,
        card_key: data.card_key,
        card_name: data.card_name,
        orientation: data.orientation,
        orientation_name: data.orientation_name,
        category_name: data.category_name,
        topic_name: data.topic_name,
        subtopic_name: data.subtopic_name,
        timing_name: data.timing_name,
        position_adjustment: positionAdjustment,
        interpretation_text: data.interpretation_text,
      });
    }

    return NextResponse.json({
      ok: true,
      category_key: body.category_key,
      topic_key: body.topic_key ?? null,
      subtopic_key: body.subtopic_key ?? null,
      spread_key: body.spread_key ?? null,
      cards: results,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}