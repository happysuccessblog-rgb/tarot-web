import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SaveFinalReadingBody = {
  reading_key?: string;
  final_reading_text?: string;
  summary_text?: string;
  advice_text?: string;
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
    const body = (await request.json()) as SaveFinalReadingBody;

    if (!body.reading_key) {
      return jsonUtf8({ ok: false, error: "reading_key is required" }, 400);
    }

    if (!body.final_reading_text) {
      return jsonUtf8(
        { ok: false, error: "final_reading_text is required" },
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
      .select("reading_key")
      .eq("reading_key", body.reading_key)
      .maybeSingle();

    if (readingError) {
      return jsonUtf8({ ok: false, error: readingError.message }, 500);
    }

    if (!reading) {
      return jsonUtf8({ ok: false, error: "reading not found" }, 404);
    }

    const { error: updateError } = await supabase
      .from("tarot_readings_prod")
      .update({
        final_reading_text: body.final_reading_text,
        summary_text: body.summary_text ?? "",
        advice_text: body.advice_text ?? "",
        status: "completed",
        updated_at: now,
      })
      .eq("reading_key", body.reading_key);

    if (updateError) {
      return jsonUtf8({ ok: false, error: updateError.message }, 500);
    }

    return jsonUtf8({
      ok: true,
      reading_key: body.reading_key,
      status: "completed",
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}