import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

type Params = {
  params: Promise<{
    reading_key: string;
  }>;
};

type DisplayCard = {
  card_name: string;
  orientation_name: string;
};

function safeText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

export async function GET(_request: Request, { params }: Params) {
  const { reading_key } = await params;

  let spreadName = "タロット占い";
  let categoryName = "無料占い";
  let topicName = "鑑定結果";
  let subtopicName = "";
  let displayCards: DisplayCard[] = [];

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { data: reading } = await supabase
        .from("tarot_readings_prod")
        .select("category_key, topic_key, subtopic_key, spread_key")
        .eq("reading_key", reading_key)
        .maybeSingle();

      if (reading) {
        const { data: category } = await supabase
          .from("tarot_categories_prod")
          .select("category_name")
          .eq("category_key", reading.category_key)
          .maybeSingle();

        const { data: topic } = await supabase
          .from("tarot_topics_prod")
          .select("topic_name")
          .eq("category_key", reading.category_key)
          .eq("topic_key", reading.topic_key)
          .maybeSingle();

        const { data: subtopic } = await supabase
          .from("tarot_subtopics_prod")
          .select("subtopic_name")
          .eq("category_key", reading.category_key)
          .eq("topic_key", reading.topic_key)
          .eq("subtopic_key", reading.subtopic_key)
          .maybeSingle();

        const { data: spread } = await supabase
          .from("tarot_spreads_prod")
          .select("spread_name")
          .eq("spread_key", reading.spread_key)
          .maybeSingle();

        const { data: readingCards } = await supabase
          .from("tarot_reading_cards_prod")
          .select("position_no, card_name, orientation_name")
          .eq("reading_key", reading_key)
          .order("position_no", { ascending: true })
          .limit(3);

        categoryName = safeText(category?.category_name, reading.category_key);
        topicName = safeText(topic?.topic_name, reading.topic_key);
        subtopicName = safeText(subtopic?.subtopic_name, reading.subtopic_key);
        spreadName = safeText(spread?.spread_name, reading.spread_key);

        displayCards = (readingCards ?? []).map((item) => ({
          card_name: safeText(item.card_name, ""),
          orientation_name: safeText(item.orientation_name, ""),
        }));
      }
    }
  } catch {
    // OGP生成を止めない
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: "64px",
          background:
            "linear-gradient(135deg, #120d1f 0%, #25143d 55%, #3b2416 100%)",
          color: "#fff8e7",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "640px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "24px",
              letterSpacing: "0.25em",
              color: "#f5c66b",
              marginBottom: "22px",
            }}
          >
            FREE TAROT READING
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "58px",
              fontWeight: 800,
              lineHeight: 1.12,
              marginBottom: "24px",
            }}
          >
            {spreadName}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "30px",
              lineHeight: 1.35,
              color: "#f7e7b1",
              maxWidth: "620px",
            }}
          >
            {categoryName} / {topicName}
            {subtopicName ? " / " + subtopicName : ""}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "44px",
              padding: "14px 22px",
              border: "1px solid #d8b15f",
              borderRadius: "999px",
              fontSize: "22px",
              color: "#d8b15f",
              alignSelf: "flex-start",
            }}
          >
            タロット占い結果
          </div>
        </div>

        {displayCards.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              marginLeft: "52px",
              width: "390px",
            }}
          >
            {displayCards.map((card, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "18px 22px",
                  border: "1px solid rgba(245, 198, 107, 0.55)",
                  borderRadius: "22px",
                  backgroundColor: "rgba(18, 13, 31, 0.62)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: "22px",
                    fontWeight: 800,
                    color: "#f5c66b",
                    marginBottom: "8px",
                  }}
                >
                  {index + 1}枚目
                </div>

                <div
                  style={{
                    display: "flex",
                    fontSize: "30px",
                    fontWeight: 800,
                    color: "#fff8e7",
                    lineHeight: 1.2,
                  }}
                >
                  {card.card_name}
                </div>

                <div
                  style={{
                    display: "flex",
                    marginTop: "8px",
                    fontSize: "22px",
                    color: "#f7e7b1",
                  }}
                >
                  {card.orientation_name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}