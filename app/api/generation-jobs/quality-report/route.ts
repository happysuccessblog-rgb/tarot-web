import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GroupKey = "batch" | "card" | "orientation" | "category" | "topic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");
    const groupBy = (searchParams.get("group_by") ?? "card") as GroupKey;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("tarot_generation_jobs")
      .select(
        `
        batch_key,
        card_key,
        card_name,
        orientation,
        orientation_name,
        category_key,
        category_name,
        topic_key,
        topic_name,
        status
      `
      );

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

    const rows = data ?? [];

    function getGroup(row: any) {
      if (groupBy === "batch") {
        return {
          key: row.batch_key ?? "unknown",
          name: row.batch_key ?? "unknown",
        };
      }

      if (groupBy === "orientation") {
        return {
          key: row.orientation ?? "unknown",
          name: row.orientation_name ?? row.orientation ?? "unknown",
        };
      }

      if (groupBy === "category") {
        return {
          key: row.category_key ?? "unknown",
          name: row.category_name ?? row.category_key ?? "unknown",
        };
      }

      if (groupBy === "topic") {
        return {
          key: row.topic_key ?? "unknown",
          name: row.topic_name ?? row.topic_key ?? "unknown",
        };
      }

      return {
        key: row.card_key ?? "unknown",
        name: row.card_name ?? row.card_key ?? "unknown",
      };
    }

    const map = new Map<
      string,
      {
        key: string;
        name: string;
        total: number;
        pending: number;
        processing: number;
        generated: number;
        approved: number;
        reviewed: number;
        skipped: number;
        error: number;
      }
    >();

    for (const row of rows) {
      const group = getGroup(row);

      if (!map.has(group.key)) {
        map.set(group.key, {
          key: group.key,
          name: group.name,
          total: 0,
          pending: 0,
          processing: 0,
          generated: 0,
          approved: 0,
          reviewed: 0,
          skipped: 0,
          error: 0,
        });
      }

      const item = map.get(group.key)!;
      item.total++;

      const status = row.status ?? "error";

      if (status === "pending") item.pending++;
      else if (status === "processing") item.processing++;
      else if (status === "generated") item.generated++;
      else if (status === "approved") item.approved++;
      else if (status === "reviewed") item.reviewed++;
      else if (status === "skipped") item.skipped++;
      else item.error++;
    }

    const report = Array.from(map.values()).map((item) => {
      const completed =
        item.generated + item.approved + item.reviewed + item.skipped;

      return {
        ...item,
        completion_rate:
          item.total > 0
            ? Number(((completed / item.total) * 100).toFixed(2))
            : 0,
        approval_rate:
          item.total > 0
            ? Number(((item.approved / item.total) * 100).toFixed(2))
            : 0,
        regenerate_candidate_rate:
          item.total > 0
            ? Number(((item.pending / item.total) * 100).toFixed(2))
            : 0,
      };
    });

    report.sort((a, b) => {
      if (a.approval_rate !== b.approval_rate) {
        return a.approval_rate - b.approval_rate;
      }

      return b.total - a.total;
    });

    return NextResponse.json({
      ok: true,
      batch_key: batchKey ?? "all",
      group_by: groupBy,
      total_groups: report.length,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}