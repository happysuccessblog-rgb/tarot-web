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

    const categoryKey = searchParams.get("category_key");
    const topicKey = searchParams.get("topic_key");
    const subtopicKey = searchParams.get("subtopic_key");
    const resultMood = searchParams.get("result_mood");
    const actionSignal = searchParams.get("action_signal");

    if (!categoryKey || !resultMood || !actionSignal) {
      return jsonUtf8(
        {
          ok: false,
          error:
            "category_key, result_mood, and action_signal are required",
        },
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("tarot_affiliate_links_prod")
      .select(
        `
        id,
        category_key,
        topic_key,
        subtopic_key,
        result_mood,
        action_signal,
        title,
        description,
        link_url,
        link_type,
        priority
      `
      )
      .eq("category_key", categoryKey)
      .eq("result_mood", resultMood)
      .eq("action_signal", actionSignal)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(6);

    if (topicKey) {
      query = query.or(`topic_key.is.null,topic_key.eq.${topicKey}`);
    } else {
      query = query.is("topic_key", null);
    }

    if (subtopicKey) {
      query = query.or(`subtopic_key.is.null,subtopic_key.eq.${subtopicKey}`);
    } else {
      query = query.is("subtopic_key", null);
    }

    const { data, error } = await query;

    if (error) throw error;

    const links = (data ?? []).sort((a, b) => {
      const aSpecificity =
        (a.topic_key ? 1 : 0) + (a.subtopic_key ? 1 : 0);
      const bSpecificity =
        (b.topic_key ? 1 : 0) + (b.subtopic_key ? 1 : 0);

      if (aSpecificity !== bSpecificity) {
        return bSpecificity - aSpecificity;
      }

      return (a.priority ?? 100) - (b.priority ?? 100);
    });

    return jsonUtf8({
      ok: true,
      links: links.slice(0, 3),
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