import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RecoverStaleBody = {
  batch_key?: string;
  minutes?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RecoverStaleBody;

    const batchKey = body.batch_key;
    const minutes = body.minutes ?? 30;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const threshold = new Date(
      Date.now() - minutes * 60 * 1000
    ).toISOString();

    let query = supabase
      .from("tarot_generation_jobs")
      .update({
        status: "pending",
        locked_at: null,
        updated_at: new Date().toISOString(),
        error_message: "Recovered from stale processing status",
      })
      .eq("status", "processing")
      .lt("locked_at", threshold)
      .select("id, job_key, batch_key, status");

    if (batchKey) {
      query = query.eq("batch_key", batchKey);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      batch_key: batchKey ?? "all",
      minutes,
      recovered_count: data?.length ?? 0,
      recovered_jobs: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}