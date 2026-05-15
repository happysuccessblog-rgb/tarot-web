import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SaveReadingBody = {
  spread_key?: string;
  spread_name?: string;
  question?: string;
  cards?: string;
  reading_summary?: string;
  reading_detail?: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get("x-api-key");

    if (apiKey !== process.env.SAVE_READING_API_KEY) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as SaveReadingBody;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const payload = {
      id: 1,
      created_at: new Date().toISOString(),
      spread_key: body.spread_key ?? "",
      spread_name: body.spread_name ?? "",
      question: body.question ?? "",
      cards: body.cards ?? "",
      reading_summary: body.reading_summary ?? "",
      reading_detail: body.reading_detail ?? "",
    };

    const { data, error } = await supabase
      .from("tarot_latest_reading")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reading: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}