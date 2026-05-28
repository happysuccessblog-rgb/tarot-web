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

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8(
        { ok: false, error: "Supabase environment variables are missing" },
        500
      );
    }

    const body = await request.json();

    const readingKey = body.reading_key ?? null;
    const resultMood = body.result_mood ?? null;
    const actionSignal = body.action_signal ?? null;
    const links = Array.isArray(body.links) ? body.links : [];

    if (!readingKey || links.length === 0) {
      return jsonUtf8(
        { ok: false, error: "reading_key and links are required" },
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const rows = links.map((link: any, index: number) => ({
      reading_key: readingKey,
      affiliate_link_id: link.id,
      category_key: link.category_key ?? null,
      topic_key: link.topic_key ?? null,
      subtopic_key: link.subtopic_key ?? null,
      result_mood: resultMood,
      action_signal: actionSignal,
      link_type: link.link_type ?? null,
      displayed_url: link.link_url ?? null,
      display_position: index + 1,
      user_agent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
    }));

    const { error } = await supabase
      .from("tarot_affiliate_impression_logs_prod")
      .insert(rows);

    if (error) throw error;

    return jsonUtf8({
      ok: true,
      inserted: rows.length,
    });
  } catch (error: any) {
    return jsonUtf8(
      {
        ok: false,
        error:
          error?.message ??
          error?.details ??
          error?.hint ??
          JSON.stringify(error),
      },
      500
    );
  }
}