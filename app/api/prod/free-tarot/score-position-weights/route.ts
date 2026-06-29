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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const spreadKey = searchParams.get("spread_key");

    if (!spreadKey) {
      return jsonUtf8({ ok: false, error: "spread_key is required" }, 400);
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

    const { data, error } = await supabase
      .from("tarot_score_position_weights_prod")
      .select(`
        spread_key,
        score_key,
        position_no,
        weight
      `)
      .eq("spread_key", spreadKey)
      .eq("is_active", true)
      .order("score_key", { ascending: true })
      .order("position_no", { ascending: true });

    if (error) {
      return jsonUtf8({ ok: false, error: error.message }, 500);
    }

    return jsonUtf8({
      ok: true,
      spread_key: spreadKey,
      weights: data ?? [],
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}