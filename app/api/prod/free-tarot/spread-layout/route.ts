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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8(
        {
          ok: false,
          error: "Supabase environment variables are missing",
        },
        500
      );
    }

    const { searchParams } = new URL(request.url);
    const spreadKey = searchParams.get("spread_key");
    const usageType = searchParams.get("usage_type") ?? "default";

    if (!spreadKey) {
      return jsonUtf8(
        {
          ok: false,
          error: "spread_key is required",
        },
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: positions, error } = await supabase
      .from("tarot_spread_positions_prod")
      .select(
        `
        spread_key,
        position_no,
        position_name,
        position_description,
        position_subject,
        subject_note,
        x_percent,
        y_percent,
        rotation_deg,
        usage_type
      `
      )
      .eq("spread_key", spreadKey)
      .eq("usage_type", usageType)
      .eq("is_active", true)
      .order("position_no", { ascending: true });

    if (error) {
      console.error("positions query error:", error);
      throw error;
    }

    return jsonUtf8({
      ok: true,
      spread_key: spreadKey,
      usage_type: usageType,
      positions: positions ?? [],
    });
  } catch (error: any) {
    console.error("spread-layout error:", error);

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