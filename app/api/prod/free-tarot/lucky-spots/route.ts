import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LuckySpotOfferRow = {
  id: number;
  booking_category: string;
  spot_type: string;
  spot_name: string;
  search_keyword: string;
  area_hint: string;
  location_type: string | null;
  genre: string | null;
  time_zone: string | null;
  price_rank: string | null;
  priority: number | null;
};

type LuckySpotOfferLinkRow = {
  id: number;
  booking_category: string;
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

    const readingKey = searchParams.get("reading_key") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: spots, error: spotsError } = await supabase
      .from("tarot_lucky_spot_offers_prod")
      .select(
        `
        id,
        booking_category,
        spot_type,
        spot_name,
        search_keyword,
        area_hint,
        location_type,
        genre,
        time_zone,
        price_rank,
        priority
      `
      )
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(800);

    if (spotsError) {
      throw spotsError;
    }

    const spotRows = (spots ?? []) as LuckySpotOfferRow[];

    const shuffledSpotRows = seededShuffle(
      spotRows,
      readingKey || "lucky-spots",
      (spot) => spot.id
    );

    const usedSpotNames = new Set<string>();
    const usedSearchKeywords = new Set<string>();
    const categoryCounts = new Map<string, number>();
    const selectedSpotRows: LuckySpotOfferRow[] = [];

    for (const spot of shuffledSpotRows) {
      if (usedSpotNames.has(spot.spot_name)) continue;
      if (usedSearchKeywords.has(spot.search_keyword)) continue;

      const currentCategoryCount =
        categoryCounts.get(spot.booking_category) ?? 0;

      if (currentCategoryCount >= 2) continue;

      selectedSpotRows.push(spot);
      usedSpotNames.add(spot.spot_name);
      usedSearchKeywords.add(spot.search_keyword);
      categoryCounts.set(spot.booking_category, currentCategoryCount + 1);

      if (selectedSpotRows.length >= 3) break;
    }

    if (selectedSpotRows.length === 0) {
      return jsonUtf8({
        ok: true,
        items: [],
      });
    }

    const bookingCategories = Array.from(
      new Set(
        selectedSpotRows
          .map((spot) => spot.booking_category)
          .filter((category): category is string => Boolean(category))
      )
    );

    const { data: links, error: linksError } = await supabase
      .from("tarot_lucky_spot_offer_links_prod")
      .select(
        `
        id,
        booking_category,
        site_name,
        affiliate_base_url,
        priority
      `
      )
      .in("booking_category", bookingCategories)
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (linksError) {
      throw linksError;
    }

    const linkRows = (links ?? []) as LuckySpotOfferLinkRow[];

    const spotsWithLinks = selectedSpotRows.map((spot) => {
      return {
        ...spot,
        links: linkRows
          .filter((link) => link.booking_category === spot.booking_category)
          .map((link) => ({
            id: link.id,
            booking_category: link.booking_category,
            site_name: link.site_name,
            affiliate_base_url: link.affiliate_base_url,
            priority: link.priority,
          })),
      };
    });

    return jsonUtf8({
      ok: true,
      items: spotsWithLinks,
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