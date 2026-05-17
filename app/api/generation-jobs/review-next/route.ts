import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Number(limitParam ?? 1), 20);

    if (!batchKey) {
      return NextResponse.json(
        { error: "batch_key is required" },
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

    const { data: jobs, error } = await supabase
      .from("tarot_generation_jobs")
      .select("*")
      .eq("batch_key", batchKey)
      .eq("status", "generated")
      .order("generated_at", { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      jobs: jobs ?? [],
      message:
        jobs && jobs.length > 0
          ? "Review jobs returned"
          : "No generated jobs waiting for review",
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}