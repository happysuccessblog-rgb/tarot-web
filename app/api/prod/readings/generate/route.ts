import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateReadingBody = {
  reading_key?: string;
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateReadingBody;

    if (!body.reading_key) {
      return jsonUtf8(
        { ok: false, error: "reading_key is required" },
        400
      );
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
    const now = new Date().toISOString();

    const { data: reading, error: readingError } = await supabase
      .from("tarot_readings_prod")
      .select("*")
      .eq("reading_key", body.reading_key)
      .maybeSingle();

    if (readingError) {
      return jsonUtf8({ ok: false, error: readingError.message }, 500);
    }

    if (!reading) {
      return jsonUtf8({ ok: false, error: "reading not found" }, 404);
    }

    const { data: cards, error: cardsError } = await supabase
      .from("tarot_reading_cards_prod")
      .select("*")
      .eq("reading_key", body.reading_key)
      .order("position_no", { ascending: true });

    if (cardsError) {
      return jsonUtf8({ ok: false, error: cardsError.message }, 500);
    }

    if (!cards || cards.length === 0) {
      return jsonUtf8({ ok: false, error: "reading cards not found" }, 404);
    }

    const results = [];

    for (const card of cards) {
      const { data: text, error: textError } = await supabase
        .from("tarot_interpretation_texts_prod")
        .select("interpretation_text")
        .eq("card_key", card.card_key)
        .eq("orientation", card.orientation)
        .eq("category_key", reading.category_key)
        .eq("topic_key", reading.topic_key)
        .eq("subtopic_key", reading.subtopic_key)
        .eq("timing_key", "present")
        .eq("text_role", "main")
        .eq("length_type", "normal")
        .eq("tone_type", "soft")
        .eq("is_approved", true)
        .maybeSingle();

      if (textError) {
        return jsonUtf8({ ok: false, error: textError.message }, 500);
      }

      const interpretationText = text?.interpretation_text ?? "";

      await supabase
        .from("tarot_reading_cards_prod")
        .update({
          interpretation_text: interpretationText,
          updated_at: now,
        })
        .eq("id", card.id);

      results.push({
        position_no: card.position_no,
        position_name: card.position_name,
        card_name: card.card_name,
        orientation_name: card.orientation_name,
        found: Boolean(interpretationText),
      });
    }

    await supabase
      .from("tarot_readings_prod")
      .update({
        status: "card_interpretations_applied",
        updated_at: now,
      })
      .eq("reading_key", body.reading_key);

    return jsonUtf8({
      ok: true,
      reading_key: body.reading_key,
      results,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}