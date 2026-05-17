import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
// const apiKey = request.headers.get("x-api-key");

// if (apiKey !== process.env.SAVE_READING_API_KEY) {
//   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// }

    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");
    const limitParam = searchParams.get("limit");

    const limit = Math.min(Number(limitParam ?? 5), 20);

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
      .eq("status", "pending")
      .order("id", { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        ok: true,
        jobs: [],
        message: "No pending jobs",
      });
    }

    const jobKeys = jobs.map((job) => job.job_key);

    const { error: updateError } = await supabase
      .from("tarot_generation_jobs")
      .update({
        status: "processing",
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("job_key", jobKeys);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      jobs,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}