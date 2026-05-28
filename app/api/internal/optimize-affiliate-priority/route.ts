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
    const authHeader = request.headers.get("authorization");

    if (
      authHeader !==
      `Bearer ${process.env.INTERNAL_CRON_SECRET}`
    ) {
      return jsonUtf8(
        {
          ok: false,
          error: "Unauthorized",
        },
        401
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonUtf8(
        {
          ok: false,
          error: "Supabase env missing",
        },
        500
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const { data: summaries, error: summaryError } =
      await supabase
        .from("tarot_affiliate_ctr_summary_prod")
        .select("*");

    if (summaryError) {
      throw summaryError;
    }

    let updatedCount = 0;

    for (const row of summaries ?? []) {
      const impressions =
        Number(row.impressions ?? 0);

      const ctr =
        Number(row.ctr_percent ?? 0);

      if (impressions < 20) {
        continue;
      }

      let newPriority = Number(row.priority ?? 100);

      if (ctr >= 15) {
        newPriority = Math.max(
          newPriority - 5,
          1
        );
      } else if (ctr < 3) {
        newPriority = Math.min(
          newPriority + 10,
          999
        );
      } else {
        continue;
      }

      const { error: updateError } = await supabase
        .from("tarot_affiliate_links_prod")
        .update({
          priority: newPriority,
        })
        .eq(
          "id",
          row.affiliate_link_id
        );

      if (updateError) {
        console.error(updateError);
        continue;
      }

      updatedCount++;
    }

    return jsonUtf8({
      ok: true,
      updated_count: updatedCount,
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