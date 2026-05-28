import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { searchParams } = new URL(request.url);

  const linkId = searchParams.get("link_id");
  const readingKey = searchParams.get("reading_key") ?? null;
  const resultMood = searchParams.get("result_mood") ?? null;
  const actionSignal = searchParams.get("action_signal") ?? null;

  if (!linkId) {
    return NextResponse.json(
      { ok: false, error: "link_id is required" },
      { status: 400 }
    );
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase environment variables are missing" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: link, error: linkError } = await supabase
    .from("tarot_affiliate_links_prod")
    .select(
      `
      id,
      category_key,
      topic_key,
      subtopic_key,
      result_mood,
      action_signal,
      link_url,
      link_type,
      is_active
    `
    )
    .eq("id", Number(linkId))
    .maybeSingle();

  if (linkError || !link || !link.is_active || !link.link_url) {
    return NextResponse.json(
      { ok: false, error: "affiliate link not found" },
      { status: 404 }
    );
  }

  const userAgent = request.headers.get("user-agent");
  const referrer = request.headers.get("referer");
  const _ip = getClientIp(request);

  await supabase.from("tarot_affiliate_click_logs_prod").insert({
    reading_key: readingKey,
    affiliate_link_id: link.id,
    category_key: link.category_key,
    topic_key: link.topic_key,
    subtopic_key: link.subtopic_key,
    result_mood: resultMood ?? link.result_mood,
    action_signal: actionSignal ?? link.action_signal,
    link_type: link.link_type,
    clicked_url: link.link_url,
    user_agent: userAgent,
    referrer,
  });

  return NextResponse.redirect(link.link_url, {
    status: 302,
  });
}