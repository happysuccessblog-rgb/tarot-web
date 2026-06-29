import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DisplayGroup = "main" | "sub";
type DisplayRole = "primary" | "secondary" | "fallback";

type AffiliateLinkRow = {
  id: number;
  category_key: string | null;
  topic_key: string | null;
  result_mood: string | null;
  action_signal: string | null;
  title: string;
  description: string | null;
  link_url: string;
  link_type: string | null;
  display_group: string | null;
  display_role: string | null;
  display_priority: number | null;
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

function isMarriageContext(params: {
  topicKey: string | null;
}) {
  const text = [params.topicKey]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("marriage") ||
    text.includes("wedding") ||
    text.includes("spouse") ||
    text.includes("couple") ||
    text.includes("結婚") ||
    text.includes("夫婦") ||
    text.includes("婚姻")
  );
}

function isMatchingLink(link: AffiliateLinkRow) {
  const text = [link.link_type, link.title, link.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("matching") ||
    text.includes("match") ||
    text.includes("dating") ||
    text.includes("マッチング") ||
    text.includes("出会い系") ||
    text.includes("婚活")
  );
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

function selectUniqueLinks(
  rows: AffiliateLinkRow[],
  params: {
    topicKey: string | null;
    maxItems: number;
  }
) {
  const marriageContext = isMarriageContext({
    topicKey: params.topicKey,
  });

  const usedTitles = new Set<string>();
  const usedLinkTypes = new Set<string>();
  const selected: AffiliateLinkRow[] = [];

  for (const row of rows) {
    if (marriageContext && isMatchingLink(row)) {
      continue;
    }

    const titleKey = normalizeText(row.title);
    const linkTypeKey = normalizeText(row.link_type);

    if (titleKey && usedTitles.has(titleKey)) {
      continue;
    }

    if (linkTypeKey && usedLinkTypes.has(linkTypeKey)) {
      continue;
    }

    selected.push(row);

    if (titleKey) usedTitles.add(titleKey);
    if (linkTypeKey) usedLinkTypes.add(linkTypeKey);

    if (selected.length >= params.maxItems) {
      break;
    }
  }

  return selected;
}

function sortAffiliateLinks(rows: AffiliateLinkRow[]) {
  return [...rows].sort((a, b) => {
    const aSpecificity = a.topic_key ? 1 : 0;
    const bSpecificity = b.topic_key ? 1 : 0;

    if (aSpecificity !== bSpecificity) {
      return bSpecificity - aSpecificity;
    }

    const aDisplayPriority = a.display_priority ?? 100;
    const bDisplayPriority = b.display_priority ?? 100;

    if (aDisplayPriority !== bDisplayPriority) {
      return aDisplayPriority - bDisplayPriority;
    }

    return (a.priority ?? 100) - (b.priority ?? 100);
  });
}

async function fetchAffiliateLinks(params: {
  supabase: any;
  categoryKey: string;
  topicKey: string | null;
  resultMood: string;
  actionSignal: string;
  displayGroup: DisplayGroup;
  displayRole: DisplayRole;
}) {
  const {
    supabase,
    categoryKey,
    topicKey,
    resultMood,
    actionSignal,
    displayGroup,
    displayRole,
  } = params;

  let query = supabase
    .from("tarot_affiliate_links_prod")
    .select(
      `
      id,
      category_key,
      topic_key,
      result_mood,
      action_signal,
      title,
      description,
      link_url,
      link_type,
      display_group,
      display_role,
      display_priority,
      priority
    `
    )
    .eq("category_key", categoryKey)
    .eq("result_mood", resultMood)
    .eq("action_signal", actionSignal)
    .eq("display_group", displayGroup)
    .eq("display_role", displayRole)
    .eq("is_active", true)
    .order("display_priority", { ascending: true })
    .order("priority", { ascending: true })
    .limit(20);

  if (topicKey) {
    query = query.or(`topic_key.is.null,topic_key.eq.${topicKey}`);
  } else {
    query = query.is("topic_key", null);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as AffiliateLinkRow[];
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
    const resultMood = searchParams.get("result_mood");
    const actionSignal = searchParams.get("action_signal");

    if (!categoryKey || !resultMood || !actionSignal) {
      return jsonUtf8(
        {
          ok: false,
          error: "category_key, result_mood, and action_signal are required",
        },
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const searchSteps: {
      displayGroup: DisplayGroup;
      displayRole: DisplayRole;
    }[] = [
      { displayGroup: "main", displayRole: "primary" },
      { displayGroup: "main", displayRole: "secondary" },
      { displayGroup: "main", displayRole: "fallback" },
      { displayGroup: "sub", displayRole: "fallback" },
    ];

    let selectedRows: AffiliateLinkRow[] = [];
    let usedDisplayGroup: DisplayGroup | null = null;
    let usedDisplayRole: DisplayRole | null = null;

    for (const step of searchSteps) {
      const rows = await fetchAffiliateLinks({
        supabase,
        categoryKey,
        topicKey,
        resultMood,
        actionSignal,
        displayGroup: step.displayGroup,
        displayRole: step.displayRole,
      });

      const sortedRows = sortAffiliateLinks(rows);

      const links = selectUniqueLinks(sortedRows, {
        topicKey,
        maxItems: 3,
      });

      if (links.length > 0) {
        selectedRows = links;
        usedDisplayGroup = step.displayGroup;
        usedDisplayRole = step.displayRole;
        break;
      }
    }

    return jsonUtf8({
      ok: true,
      display_group: usedDisplayGroup,
      display_role: usedDisplayRole,
      links: selectedRows,
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