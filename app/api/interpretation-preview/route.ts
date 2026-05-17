import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const cardKey = searchParams.get("card_key");
    const orientation = searchParams.get("orientation");
    const categoryKey = searchParams.get("category_key");
    const topicKey = searchParams.get("topic_key");
    const subtopicKey = searchParams.get("subtopic_key");
    const timingKey = searchParams.get("timing_key");

    if (!cardKey || !orientation || !categoryKey) {
      return NextResponse.json(
        {
          error: "card_key, orientation, category_key are required",
        },
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
        text_role,
        length_type,
        keywords,
        interpretation_text,
        is_active,
        updated_at
      `
      )
      .eq("card_key", cardKey)
      .eq("orientation", orientation)
      .eq("category_key", categoryKey)
      .eq("text_role", "main")
      .eq("length_type", "normal")
      .eq("is_active", true);

    if (topicKey) {
      query = query.eq("topic_key", topicKey);
    } else {
      query = query.is("topic_key", null);
    }

    if (subtopicKey) {
      query = query.eq("subtopic_key", subtopicKey);
    } else {
      query = query.is("subtopic_key", null);
    }

    if (timingKey) {
      query = query.eq("timing_key", timingKey);
    } else {
      query = query.is("timing_key", null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({
        ok: true,
        found: false,
        message: "No interpretation found",
      });
    }

    return NextResponse.json({
      ok: true,
      found: true,
      interpretation: data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}