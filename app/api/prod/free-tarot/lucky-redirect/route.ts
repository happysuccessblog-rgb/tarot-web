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

function buildSearchUrl(baseUrl: string, keyword: string | null) {
  if (!keyword) return baseUrl;

  return baseUrl + encodeURIComponent(keyword);
}

async function insertClickLog(params: {
  supabase: any;
  readingKey: string | null;
  targetType: string;
  targetId: number;
  linkId: number;
  siteName: string | null;
  searchKeyword: string | null;
  redirectUrl: string;
  resultMood: string | null;
  actionSignal: string | null;
}) {
  const {
    supabase,
    readingKey,
    targetType,
    targetId,
    linkId,
    siteName,
    searchKeyword,
    redirectUrl,
    resultMood,
    actionSignal,
  } = params;

  const { error } = await supabase.from("tarot_lucky_click_logs_prod").insert({
    reading_key: readingKey,
    target_type: targetType,
    target_id: targetId,
    link_id: linkId,
    site_name: siteName,
    search_keyword: searchKeyword,
    redirect_url: redirectUrl,
    result_mood: resultMood,
    action_signal: actionSignal,
  });
  if (error) {
  console.error(error);
  }
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

    const type = searchParams.get("type");
    const linkId = searchParams.get("link_id");
    const readingKey = searchParams.get("reading_key");
    const resultMood = searchParams.get("result_mood");
    const actionSignal = searchParams.get("action_signal");

    if (!linkId) {
      return jsonUtf8(
        {
          ok: false,
          error: "link_id is required",
        },
        400
      );
    }

    const parsedLinkId = Number(linkId);

    if (Number.isNaN(parsedLinkId)) {
      return jsonUtf8(
        {
          ok: false,
          error: "invalid link_id",
        },
        400
      );
    }

    if (!type || !["item", "spot"].includes(type)) {
      return jsonUtf8(
        {
          ok: false,
          error: "type must be item or spot",
        },
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (type === "item") {
      const { data: link, error: linkError } = await supabase
        .from("tarot_lucky_item_links_prod")
        .select(
          `
          id,
          lucky_item_id,
          site_name,
          affiliate_base_url,
          is_active
        `
        )
        .eq("id", parsedLinkId)
        .eq("is_active", true)
        .maybeSingle();

      if (linkError) {
        throw linkError;
      }

      if (!link?.affiliate_base_url) {
        return jsonUtf8(
          {
            ok: false,
            error: "item redirect target not found",
          },
          404
        );
      }

      const { data: item, error: itemError } = await supabase
        .from("tarot_lucky_items_prod")
        .select("id, search_keyword, is_active")
        .eq("id", link.lucky_item_id)
        .eq("is_active", true)
        .maybeSingle();

      if (itemError) {
        throw itemError;
      }

      if (!item) {
        return jsonUtf8(
          {
            ok: false,
            error: "lucky item not found",
          },
          404
        );
      }

      const redirectUrl = buildSearchUrl(
        link.affiliate_base_url,
        item.search_keyword
      );

      await insertClickLog({
        supabase,
        readingKey,
        targetType: "item",
        targetId: item.id,
        linkId: link.id,
        siteName: link.site_name,
        searchKeyword: item.search_keyword,
        redirectUrl,
        resultMood,
        actionSignal,
      });

      return NextResponse.redirect(redirectUrl, 302);
    }

    const spotId = searchParams.get("spot_id");

    if (!spotId) {
      return jsonUtf8(
        {
          ok: false,
          error: "spot_id is required",
        },
        400
      );
    }

    const parsedSpotId = Number(spotId);

    if (Number.isNaN(parsedSpotId)) {
      return jsonUtf8(
        {
          ok: false,
          error: "invalid spot_id",
        },
        400
      );
    }

    const { data: link, error: linkError } = await supabase
      .from("tarot_lucky_spot_offer_links_prod")
      .select(
        `
        id,
        booking_category,
        site_name,
        affiliate_base_url,
        is_active
      `
      )
      .eq("id", parsedLinkId)
      .eq("is_active", true)
      .maybeSingle();

    if (linkError) {
      throw linkError;
    }

    if (!link?.affiliate_base_url) {
      return jsonUtf8(
        {
          ok: false,
          error: "spot redirect target not found",
        },
        404
      );
    }

    const { data: spot, error: spotError } = await supabase
      .from("tarot_lucky_spot_offers_prod")
      .select(
        `
        id,
        spot_name,
        booking_category,
        spot_type,
        search_keyword,
        is_active
      `
      )
      .eq("id", parsedSpotId)
      .eq("is_active", true)
      .maybeSingle();

    if (spotError) {
      throw spotError;
    }

    if (!spot) {
      return jsonUtf8(
        {
          ok: false,
          error: "lucky spot not found",
        },
        404
      );
    }

    if (spot.booking_category !== link.booking_category) {
      return jsonUtf8(
        {
          ok: false,
          error: "booking_category does not match link",
        },
        400
      );
    }

    const redirectUrl = buildSearchUrl(
      link.affiliate_base_url,
      spot.search_keyword
    );

    await insertClickLog({
      supabase,
      readingKey,
      targetType: "spot",
      targetId: spot.id,
      linkId: link.id,
      siteName: link.site_name,
      searchKeyword: spot.search_keyword,
      redirectUrl,
      resultMood,
      actionSignal,
    });

    return NextResponse.redirect(redirectUrl, 302);
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