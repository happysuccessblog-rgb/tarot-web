import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReasonKey =
  | "too_short"
  | "test_text"
  | "too_assertive"
  | "theme_mismatch"
  | "too_repetitive"
  | "unnatural"
  | "meaning_missing"
  | "other";

const reasonPatterns: {
  key: ReasonKey;
  name: string;
  patterns: string[];
}[] = [
  {
    key: "too_short",
    name: "文章量不足",
    patterns: ["文章量不足", "短い", "短すぎ", "文字数不足", "300"],
  },
  {
    key: "test_text",
    name: "テスト文",
    patterns: ["テスト文", "テスト", "仮文"],
  },
  {
    key: "too_assertive",
    name: "断定が強い",
    patterns: ["断定", "言い切り", "強すぎ"],
  },
  {
    key: "theme_mismatch",
    name: "テーマズレ",
    patterns: ["テーマ", "条件不一致", "ズレ", "一致していない"],
  },
  {
    key: "too_repetitive",
    name: "重複・繰り返し",
    patterns: ["重複", "繰り返し", "同じ表現"],
  },
  {
    key: "unnatural",
    name: "不自然",
    patterns: ["不自然", "ぎこちない", "違和感"],
  },
  {
    key: "meaning_missing",
    name: "meaning未登録",
    patterns: [
      "meaning未登録",
      "base_meaning",
      "orientation_meaning",
      "未登録",
      "waiting_meaning",
    ],
  },
];

function detectReason(message: string): ReasonKey {
  const text = message ?? "";

  for (const reason of reasonPatterns) {
    if (reason.patterns.some((pattern) => text.includes(pattern))) {
      return reason.key;
    }
  }

  return "other";
}

function reasonName(key: ReasonKey) {
  const found = reasonPatterns.find((reason) => reason.key === key);
  return found?.name ?? "その他";
}

function jsonUtf8(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const batchKey = searchParams.get("batch_key");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8(
        { ok: false, error: "Supabase environment variables are missing" },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("tarot_generation_jobs_prod")
      .select(
        `
        id,
        batch_key,
        job_key,
        card_key,
        card_name,
        orientation,
        orientation_name,
        category_key,
        category_name,
        topic_key,
        topic_name,
        subtopic_key,
        subtopic_name,
        timing_key,
        timing_name,
        status,
        error_message
      `
      )
      .not("error_message", "is", null)
      .neq("error_message", "");

    if (batchKey) {
      query = query.eq("batch_key", batchKey);
    }

    const { data, error } = await query;

    if (error) {
      return jsonUtf8({ ok: false, error: error.message }, 500);
    }

    const rows = data ?? [];

    const reasonMap = new Map<
      string,
      {
        reason_key: ReasonKey;
        reason_name: string;
        count: number;
        examples: {
          job_key: string;
          card_name: string;
          orientation_name: string;
          status: string;
          error_message: string;
        }[];
      }
    >();

    for (const row of rows) {
      const key = detectReason(row.error_message ?? "");

      if (!reasonMap.has(key)) {
        reasonMap.set(key, {
          reason_key: key,
          reason_name: reasonName(key),
          count: 0,
          examples: [],
        });
      }

      const item = reasonMap.get(key)!;
      item.count++;

      if (item.examples.length < 5) {
        item.examples.push({
          job_key: row.job_key,
          card_name: row.card_name ?? "",
          orientation_name: row.orientation_name ?? "",
          status: row.status ?? "",
          error_message: row.error_message ?? "",
        });
      }
    }

    const report = Array.from(reasonMap.values()).sort(
      (a, b) => b.count - a.count
    );

    return jsonUtf8({
      ok: true,
      batch_key: batchKey ?? "all",
      total_reason_jobs: rows.length,
      report,
    });
  } catch (error) {
    return jsonUtf8({ ok: false, error: String(error) }, 500);
  }
}