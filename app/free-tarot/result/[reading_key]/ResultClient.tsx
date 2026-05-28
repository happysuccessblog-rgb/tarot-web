"use client";

import { useEffect, useRef, useState } from "react";

type ReadingCard = {
  position_no: number;
  position_name: string;
  card_key: string;
  card_name?: string;
  name_ja?: string;
  orientation_name?: string;
  orientation_ja?: string;
  image_url?: string | null;
};

type ReadingResult = {
  reading_key: string;
  final_reading_text: string;
  category_key?: string;
  topic_key?: string;
  subtopic_key?: string;
  spread_key?: string;
  spread_name?: string;
  spread_image_url?: string | null;
  category_name?: string;
  topic_name?: string;
  subtopic_name?: string;
};

type SpreadPosition = {
  spread_key: string;
  position_no: number;
  position_name: string;
  position_description?: string | null;
  x_percent: number;
  y_percent: number;
  rotation_deg: number;
  usage_type: string;
};

type ReadingTextSection = {
  title: string;
  body: string;
  card?: ReadingCard;
};

type TarotScore = {
  label: string;
  value: number;
  description: string;
};

type AffiliateLink = {
  id: number;
  category_key?: string | null;
  topic_key?: string | null;
  subtopic_key?: string | null;
  title: string;
  description?: string | null;
  link_url: string;
  link_type?: string | null;
};

type AffiliateSignal = {
  resultMood: string;
  actionSignal: string;
};

async function getJson(path: string) {
  const response = await fetch(path, {
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || path + " failed");
  }

  return data;
}

function getCardName(card: ReadingCard) {
  return card.card_name ?? card.name_ja ?? card.card_key;
}

function getOrientationName(card: ReadingCard) {
  return card.orientation_name ?? card.orientation_ja ?? "";
}

function isReversed(card: ReadingCard) {
  return getOrientationName(card).includes("逆");
}

function parseReadingTextSections(
  text: string,
  cards: ReadingCard[]
): ReadingTextSection[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const matches = Array.from(normalized.matchAll(/(?:^|\n)■\s*([^\n]+)\n/g));

  if (matches.length === 0) {
    return [{ title: "鑑定文", body: normalized }];
  }

  return matches.map((match, index) => {
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index ?? normalized.length
        : normalized.length;

    const body = normalized.slice(start, end).trim();

    const card = cards.find((item) => {
      const positionName = item.position_name ?? "";
      return (
        title === positionName ||
        title.includes(positionName) ||
        positionName.includes(title)
      );
    });

    return { title, body, card };
  });
}

function calculateTarotScores(cards: ReadingCard[]): TarotScore[] {
  if (cards.length === 0) return [];

  const reversedCount = cards.filter((card) => isReversed(card)).length;
  const uprightCount = cards.length - reversedCount;
  const reversedRate = reversedCount / cards.length;

  const baseScore = Math.round(72 - reversedRate * 24);
  const feelingScore = Math.round(70 + uprightCount * 2 - reversedCount * 3);
  const progressScore = Math.round(66 + uprightCount * 2 - reversedCount * 4);
  const adviceScore = Math.round(60 + reversedCount * 5);

  return [
    {
      label: "総合運",
      value: Math.min(Math.max(baseScore, 30), 95),
      description: "今の流れ全体の安定度を表します。",
    },
    {
      label: "相手の気持ち",
      value: Math.min(Math.max(feelingScore, 30), 95),
      description: "相手の気持ちの前向きさを表します。",
    },
    {
      label: "進展可能性",
      value: Math.min(Math.max(progressScore, 25), 90),
      description: "関係が動きやすい度合いを表します。",
    },
    {
      label: "アドバイス重要度",
      value: Math.min(Math.max(adviceScore, 35), 95),
      description: "今どれだけ行動の見直しが大切かを表します。",
    },
  ];
}

function judgeAffiliateSignal(cards: ReadingCard[]): AffiliateSignal {
  if (cards.length === 0) {
    return {
      resultMood: "neutral",
      actionSignal: "prepare",
    };
  }

  const reversedCount = cards.filter((card) => isReversed(card)).length;
  const reversedRate = reversedCount / cards.length;

  const futureCard =
    cards.find((card) => {
      const name = card.position_name ?? "";
      return (
        name.includes("未来") ||
        name.includes("結果") ||
        name.includes("最終")
      );
    }) ?? cards[cards.length - 1];

  const futureCardName = (
    futureCard.card_name ??
    futureCard.name_ja ??
    futureCard.card_key
  ).toLowerCase();

  const futureReversed = isReversed(futureCard);

  const strongPositiveCards = [
    "sun",
    "star",
    "world",
    "empress",
    "ace",
    "six_of_wands",
    "ten_of_cups",
    "wheel",
  ];

  const strongCautiousCards = [
    "tower",
    "death",
    "devil",
    "moon",
    "ten_of_swords",
    "five_of_pentacles",
    "three_of_swords",
  ];

  const strongPrepareCards = [
    "hermit",
    "two_of_wands",
    "page",
    "temperance",
    "hang",
  ];

  const hasPositiveCard = strongPositiveCards.some((key) =>
    futureCardName.includes(key)
  );

  const hasCautiousCard = strongCautiousCards.some((key) =>
    futureCardName.includes(key)
  );

  const hasPrepareCard = strongPrepareCards.some((key) =>
    futureCardName.includes(key)
  );

  if (hasPositiveCard && !futureReversed) {
    return {
      resultMood: "positive",
      actionSignal: "move",
    };
  }

  if (hasCautiousCard || futureReversed) {
    return {
      resultMood: "cautious",
      actionSignal: reversedRate >= 0.6 ? "rest" : "improve_luck",
    };
  }

  if (hasPrepareCard) {
    return {
      resultMood: "neutral",
      actionSignal: "prepare",
    };
  }

  if (reversedRate >= 0.5) {
    return {
      resultMood: "cautious",
      actionSignal: "improve_luck",
    };
  }

  return {
    resultMood: "positive",
    actionSignal: "move",
  };
}

function getMainScore(scores: TarotScore[]) {
  return scores.find((score) => score.label === "総合運")?.value ?? 60;
}

function getAffiliateDisplayConfig(
  signal: AffiliateSignal | null,
  scores: TarotScore[]
) {
  const mainScore = getMainScore(scores);

  let maxItems = 2;

  if (mainScore >= 80) {
    maxItems = 3;
  } else if (mainScore < 60) {
    maxItems = 1;
  }

  if (signal?.actionSignal === "rest") {
    maxItems = 1;
  }

  if (signal?.resultMood === "positive") {
    return {
      maxItems,
      title: "今の流れに合う行動ヒント",
      description:
        "今は選択肢を広げやすい流れです。無理のない範囲で、次の一歩につながる情報を確認してみてください。",
      label: "おすすめ",
    };
  }

  if (signal?.actionSignal === "prepare") {
    return {
      maxItems,
      title: "今の流れに合う準備ヒント",
      description:
        "今はすぐに大きく動くより、情報収集や準備を整えることが向いています。",
      label: "準備におすすめ",
    };
  }

  if (signal?.actionSignal === "rest") {
    return {
      maxItems,
      title: "今の流れを整えるヒント",
      description:
        "今は無理に結論を急がず、心身を整える時間を意識してみてください。",
      label: "整えるヒント",
    };
  }

  return {
    maxItems,
    title: "今の流れに合う開運ヒント",
    description:
      "今は焦って動くより、気持ちや環境を整えることで流れを受け取りやすくなります。",
    label: "開運ヒント",
  };
}

function sendGaEvent(eventName: string, params: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  const gtag = (window as any).gtag;

  if (typeof gtag !== "function") return;

  gtag("event", eventName, params);
}

export default function ResultClient({
  readingKey,
}: {
  readingKey: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reading, setReading] = useState<ReadingResult | null>(null);
  const [cards, setCards] = useState<ReadingCard[]>([]);
  const [spreadPositions, setSpreadPositions] = useState<SpreadPosition[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [affiliateSignal, setAffiliateSignal] =
    useState<AffiliateSignal | null>(null);

  const impressionSentKeyRef = useRef<string>("");

  useEffect(() => {
    async function loadResult() {
      setLoading(true);
      setError("");
      setAffiliateLinks([]);
      setAffiliateSignal(null);

      try {
        const result = await getJson(
          "/api/prod/free-tarot/result?reading_key=" +
            encodeURIComponent(readingKey)
        );

        const resultReading = result.reading ?? null;
        const resultCards = result.cards ?? [];

        setReading(resultReading);
        setCards(resultCards);

        const resultSpreadKey = resultReading?.spread_key;

        if (resultSpreadKey) {
          const layout = await getJson(
            "/api/prod/free-tarot/spread-layout?spread_key=" +
              encodeURIComponent(resultSpreadKey)
          );

          setSpreadPositions(layout.positions ?? []);
        }

        const signal = judgeAffiliateSignal(resultCards);
        setAffiliateSignal(signal);

        if (resultReading?.category_key) {
          const affiliate = await getJson(
            "/api/prod/free-tarot/affiliate-links?category_key=" +
              encodeURIComponent(resultReading.category_key) +
              "&topic_key=" +
              encodeURIComponent(resultReading.topic_key ?? "") +
              "&subtopic_key=" +
              encodeURIComponent(resultReading.subtopic_key ?? "") +
              "&result_mood=" +
              encodeURIComponent(signal.resultMood) +
              "&action_signal=" +
              encodeURIComponent(signal.actionSignal)
          );

          setAffiliateLinks(affiliate.links ?? []);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }

    loadResult();
  }, [readingKey]);

  const readingSections = reading
    ? parseReadingTextSections(reading.final_reading_text, cards)
    : [];

  const tarotScores = calculateTarotScores(cards);

  const affiliateDisplayConfig = getAffiliateDisplayConfig(
    affiliateSignal,
    tarotScores
  );

  const visibleAffiliateLinks = affiliateLinks.slice(
    0,
    affiliateDisplayConfig.maxItems
  );

  useEffect(() => {
    if (!reading || !affiliateSignal || visibleAffiliateLinks.length === 0) {
      return;
    }

    const sentKey =
      reading.reading_key +
      ":" +
      affiliateSignal.resultMood +
      ":" +
      affiliateSignal.actionSignal +
      ":" +
      visibleAffiliateLinks.map((link) => link.id).join(",");

    if (impressionSentKeyRef.current === sentKey) {
      return;
    }

    impressionSentKeyRef.current = sentKey;

    fetch("/api/prod/free-tarot/affiliate-impressions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reading_key: reading.reading_key,
        result_mood: affiliateSignal.resultMood,
        action_signal: affiliateSignal.actionSignal,
        links: visibleAffiliateLinks,
      }),
    }).catch(() => {
      // 表示ログ失敗で画面表示は止めない
    });
  }, [reading, affiliateSignal, visibleAffiliateLinks]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#120d1f] p-10 text-white">
        読み込み中...
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#120d1f] p-10 text-red-300">
        {error}
      </main>
    );
  }

  if (!reading) {
    return (
      <main className="min-h-screen bg-[#120d1f] p-10 text-white">
        鑑定結果が見つかりません。
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#120d1f] px-5 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-[#fff8e7] p-6 text-stone-900 shadow-2xl">
          <div className="text-sm font-bold text-amber-700">鑑定結果</div>

          <h1 className="mt-2 text-3xl font-bold">
            {reading.spread_name ?? "タロット占い"}
          </h1>

          <div className="mt-2 text-sm text-stone-600">
            {reading.category_name} / {reading.topic_name} /{" "}
            {reading.subtopic_name}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                const shareText = "タロット占いの結果をシェアします🔮";
                const shareUrl = window.location.href;

                const xUrl =
                  "https://twitter.com/intent/tweet?text=" +
                  encodeURIComponent(shareText) +
                  "&url=" +
                  encodeURIComponent(shareUrl);

                window.open(xUrl, "_blank");
              }}
              className="rounded-xl bg-black px-5 py-3 text-sm font-bold text-white transition hover:opacity-80"
            >
              Xでシェア
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  alert("URLをコピーしました");
                } catch {
                  alert("コピーに失敗しました");
                }
              }}
              className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-600"
            >
              URLコピー
            </button>

            <button
              type="button"
              onClick={() => {
                const shareUrl = window.location.href;

                const lineUrl =
                  "https://social-plugins.line.me/lineit/share?url=" +
                  encodeURIComponent(shareUrl);

                window.open(lineUrl, "_blank");
              }}
              className="rounded-xl bg-green-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-600"
            >
              LINE共有
            </button>
          </div>
        </div>

        {tarotScores.length > 0 && (
          <div className="rounded-3xl bg-white p-6 text-stone-900 shadow-2xl">
            <h2 className="mb-5 text-2xl font-bold">運勢スコア</h2>

            <div className="grid gap-4 md:grid-cols-2">
              {tarotScores.map((score) => (
                <div
                  key={score.label}
                  className="rounded-2xl border border-amber-200 bg-[#fff8e7] p-5"
                >
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-amber-700">
                        {score.label}
                      </div>

                      <div className="mt-1 text-sm text-stone-600">
                        {score.description}
                      </div>
                    </div>

                    <div className="text-3xl font-bold text-amber-700">
                      {score.value}
                    </div>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-amber-100">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{
                        width: score.value + "%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {process.env.NODE_ENV === "development" && affiliateSignal && (
          <div className="rounded-3xl bg-white/10 p-4 text-sm text-white/80">
            <div className="font-bold text-amber-200">
              開発用：導線判定
            </div>
            <div className="mt-1">
              resultMood: {affiliateSignal.resultMood} / actionSignal:{" "}
              {affiliateSignal.actionSignal}
            </div>
          </div>
        )}

        {visibleAffiliateLinks.length > 0 && (
          <div className="rounded-3xl bg-white p-6 text-stone-900 shadow-2xl">
            <h2 className="mb-3 text-2xl font-bold">
              {affiliateDisplayConfig.title}
            </h2>

            <p className="mb-5 text-sm leading-6 text-stone-600">
              {affiliateDisplayConfig.description}
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              {visibleAffiliateLinks.map((link) => (
                <a
                  key={link.id}
                  href={
                    "/api/prod/free-tarot/affiliate-redirect?link_id=" +
                    encodeURIComponent(String(link.id)) +
                    "&reading_key=" +
                    encodeURIComponent(reading.reading_key) +
                    "&result_mood=" +
                    encodeURIComponent(affiliateSignal?.resultMood ?? "") +
                    "&action_signal=" +
                    encodeURIComponent(affiliateSignal?.actionSignal ?? "")
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    sendGaEvent("affiliate_click", {
                      reading_key: reading.reading_key,
                      affiliate_link_id: link.id,
                      link_type: link.link_type ?? "",
                      result_mood: affiliateSignal?.resultMood ?? "",
                      action_signal: affiliateSignal?.actionSignal ?? "",
                      category_key: reading.category_key ?? "",
                      topic_key: reading.topic_key ?? "",
                      subtopic_key: reading.subtopic_key ?? "",
                    });
                  }}
                  className="block rounded-2xl border border-amber-200 bg-[#fff8e7] p-5 transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="text-sm font-bold text-amber-700">
                    {affiliateDisplayConfig.label}
                  </div>

                  <div className="mt-2 text-lg font-bold">{link.title}</div>

                  {link.description && (
                    <div className="mt-3 text-sm leading-6 text-stone-600">
                      {link.description}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {spreadPositions.length > 0 && cards.length > 0 && (
          <div className="rounded-3xl bg-[#1b1430] p-6 text-white shadow-2xl">
            <h2 className="mb-6 text-3xl font-bold text-amber-200">
              スプレッド展開図
            </h2>

            <div className="relative mx-auto h-[1100px] w-full overflow-hidden rounded-3xl border border-amber-300/30 bg-[#120d1f]">
              {spreadPositions.map((position) => {
                const card = cards.find(
                  (item) => item.position_no === position.position_no
                );

                if (!card) return null;

                const cardName = getCardName(card);
                const orientationName = getOrientationName(card);
                const rightColumn =
                  position.position_no >= 7 && position.position_no <= 10;

                const mappedX = Math.min(
                  Math.max(50 + (position.x_percent - 50) * 1.3 + 5, 8),
                  92
                );

                const mappedY = rightColumn
                  ? (
                      {
                        10: 22,
                        9: 41,
                        8: 60,
                        7: 79,
                      } as Record<number, number>
                    )[position.position_no] ?? 50
                  : position.position_no === 3
                    ? 27
                    : position.position_no === 4
                      ? 75
                      : Math.min(
                          Math.max(
                            54 + (position.y_percent - 54) * 1.3 + 12,
                            18
                          ),
                          90
                        );

                return (
                  <div
                    key={position.position_no}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                    style={{
                      left: mappedX + "%",
                      top: mappedY + "%",
                      transform:
                        "translate(-50%, -50%) rotate(" +
                        position.rotation_deg +
                        "deg)",
                    }}
                  >
                    <div
                      className={
                        rightColumn
                          ? "flex items-center gap-3"
                          : "flex flex-col items-center"
                      }
                    >
                      {rightColumn && (
                        <div className="w-[110px] rounded-lg bg-[#120d1f]/85 px-2 py-1 text-right text-[11px] font-bold leading-4 text-amber-200 shadow">
                          <div>
                            {position.position_no}. {position.position_name}
                          </div>
                          <div className="mt-1 text-white/90">{cardName}</div>
                          <div className="text-white/80">
                            {orientationName}
                          </div>
                        </div>
                      )}

                      <div className="w-[96px] text-center">
                        {!rightColumn && (
                          <div className="mb-2 rounded-lg bg-[#120d1f]/85 px-2 py-1 text-[11px] font-bold leading-4 text-amber-200 shadow">
                            {position.position_no}. {position.position_name}
                          </div>
                        )}

                        {card.image_url && (
                          <img
                            src={card.image_url}
                            alt={cardName + "（" + orientationName + "）"}
                            className={
                              "mx-auto w-[86px] rounded-xl shadow-2xl transition-transform " +
                              (isReversed(card) ? "rotate-180" : "")
                            }
                          />
                        )}

                        {!rightColumn && (
                          <div className="mt-2 rounded-md bg-[#120d1f]/80 px-1 py-1 text-[10px] font-bold leading-3 text-white/90 shadow">
                            <div>{cardName}</div>
                            <div>{orientationName}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {reading.spread_image_url && (
          <div className="rounded-3xl bg-white p-6 text-stone-900 shadow-2xl">
            <h2 className="mb-4 text-xl font-bold">スプレッド画像</h2>

            <img
              src={reading.spread_image_url}
              alt="スプレッド画像"
              className="mx-auto max-h-[760px] w-full rounded-2xl object-contain"
            />
          </div>
        )}

        <div className="rounded-3xl bg-[#fff8e7] p-6 text-stone-900 shadow-2xl">
          <h2 className="mb-6 text-2xl font-bold">鑑定文</h2>

          <div className="space-y-6">
            {readingSections.map((section, index) => {
              const card = section.card;
              const cardName = card ? getCardName(card) : "";
              const orientationName = card ? getOrientationName(card) : "";

              return (
                <section
                  key={section.title + "-" + index}
                  className="rounded-2xl border border-[#ead8a6] bg-white/80 p-5"
                >
                  <h3 className="mb-4 text-xl font-bold text-amber-800">
                    ■ {section.title}
                  </h3>

                  {card ? (
                    <div className="grid gap-5 md:grid-cols-[140px_1fr]">
                      <div className="text-center">
                        {card.image_url && (
                          <img
                            src={card.image_url}
                            alt={cardName + "（" + orientationName + "）"}
                            className={
                              "mx-auto w-28 rounded-xl shadow-lg transition-transform " +
                              (isReversed(card) ? "rotate-180" : "")
                            }
                          />
                        )}

                        <div className="mt-3 text-sm font-bold">
                          {cardName}
                        </div>

                        <div className="text-sm text-stone-600">
                          {orientationName}
                        </div>
                      </div>

                      <div className="whitespace-pre-wrap leading-8">
                        {section.body}
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap leading-8">
                      {section.body}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}