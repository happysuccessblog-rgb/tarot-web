import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SavePositionAdjustmentItem = {
  position_no?: number;
  position_adjusted_text?: string;
};

type SavePositionAdjustmentsBody = {
  reading_key?: string;
  items?: SavePositionAdjustmentItem[];
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
    const body = (await request.json()) as SavePositionAdjustmentsBody;

    if (!body.reading_key) {
      return jsonUtf8({ ok: false, error: "reading_key is required" }, 400);
    }

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return jsonUtf8({ ok: false, error: "items are required" }, 400);
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

    const results = [];

    for (const item of body.items) {
      if (!item.position_no || !item.position_adjusted_text) {
        results.push({
          position_no: item.position_no ?? null,
          ok: false,
          error: "position_no and position_adjusted_text are required",
        });
        continue;
      }

      const { error } = await supabase
        .from("tarot_reading_cards_prod")
        .update({
          position_adjusted_text: item.position_adjusted_text,
          updated_at: now,
        })
        .eq("reading_key", body.reading_key)
        .eq("position_no", item.position_no);

      if (error) {
        results.push({
          position_no: item.position_no,
          ok: false,
          error: error.message,
        });
      } else {
        results.push({
          position_no: item.position_no,
          ok: true,
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;

    await supabase
      .from("tarot_readings_prod")
      .update({
        status: "position_adjusted",
        updated_at: now,
      })
      .eq("reading_key", body.reading_key);

    return jsonUtf8({
      ok: true,
      reading_key: body.reading_key,
      success_count: successCount,
      total_count: body.items.length,
      results,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}