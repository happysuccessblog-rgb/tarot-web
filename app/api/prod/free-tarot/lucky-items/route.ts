import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LuckyItemRow = {
  id: number;
  result_mood: string;
  action_signal: string;
  item_name: string;
  lucky_color: string | null;
  search_keyword: string | null;
  priority: number | null;
};

type LuckyItemLinkRow = {
  id: number;
  lucky_item_id: number;
  site_name: string;
  affiliate_base_url: string;
  priority: number | null;
};

function jsonUtf8(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function seededHash(input: string) {
  let hash = 0;

  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function seededShuffle<T>(
  items: T[],
  seed: string,
  getKey: (item: T) => string | number
) {
  return [...items]
    .map((item) => ({
      item,
      sortKey: seededHash(seed + ":" + String(getKey(item))),
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((entry) => entry.item);
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
    const resultMood = searchParams.get("result_mood");
    const actionSignal = searchParams.get("action_signal");
    const readingKey = searchParams.get("reading_key") ?? "";

    if (!resultMood) {
      return jsonUtf8({ ok: false, error: "result_mood is required" }, 400);
    }

    if (!actionSignal) {
      return jsonUtf8({ ok: false, error: "action_signal is required" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: items, error: itemsError } = await supabase
      .from("tarot_lucky_items_prod")
      .select(
        `
        id,
        result_mood,
        action_signal,
        item_name,
        lucky_color,
        search_keyword,
        priority
      `
      )
      .eq("result_mood", resultMood)
      .eq("action_signal", actionSignal)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(50);

    if (itemsError) {
      throw itemsError;
    }

    const itemRows = (items ?? []) as LuckyItemRow[];

    const selectedItemRows = seededShuffle(
      itemRows,
      readingKey || resultMood + ":" + actionSignal,
      (item) => item.id
    ).slice(0, 3);

    const itemIds = selectedItemRows.map((item) => item.id);

    if (itemIds.length === 0) {
      return jsonUtf8({
        ok: true,
        items: [],
      });
    }

    const { data: links, error: linksError } = await supabase
      .from("tarot_lucky_item_links_prod")
      .select(
        `
        id,
        lucky_item_id,
        site_name,
        affiliate_base_url,
        priority
      `
      )
      .in("lucky_item_id", itemIds)
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (linksError) {
      throw linksError;
    }

    const linkRows = (links ?? []) as LuckyItemLinkRow[];

    const itemsWithLinks = selectedItemRows.map((item) => {
      return {
        ...item,
        links: linkRows
          .filter((link) => link.lucky_item_id === item.id)
          .map((link) => ({
            id: link.id,
            lucky_item_id: link.lucky_item_id,
            site_name: link.site_name,
            affiliate_base_url: link.affiliate_base_url,
            priority: link.priority,
          })),
      };
    });

    return jsonUtf8({
      ok: true,
      items: itemsWithLinks,
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