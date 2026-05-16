"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type LatestReading = {
  id: number;
  created_at: string;
  spread_key: string;
  spread_name: string;
  question: string;
  cards: string;
  reading_summary: string;
  reading_detail: string;
  spread_image_url: string | null;
};

type CardListItem = {
  position_no: number;
  position_name: string;
  name_ja: string;
  orientation_ja: string;
  image_url: string | null;
};

type SummarySection = {
  title: string;
  body: string;
};

type DetailSection = {
  card?: CardListItem;
  title: string;
  body: string;
};

const majorKeys = [
  "the_fool",
  "the_magician",
  "the_high_priestess",
  "the_empress",
  "the_emperor",
  "the_hierophant",
  "the_lovers",
  "the_chariot",
  "strength",
  "the_hermit",
  "wheel_of_fortune",
  "justice",
  "the_hanged_man",
  "death",
  "temperance",
  "the_devil",
  "the_tower",
  "the_star",
  "the_moon",
  "the_sun",
  "judgement",
  "the_world",
];

const suitMap: Record<string, string> = {
  "1": "wands",
  "2": "cups",
  "3": "swords",
  "4": "pentacles",
};

const rankMap: Record<string, string> = {
  "01": "ace",
  "02": "2",
  "03": "3",
  "04": "4",
  "05": "5",
  "06": "6",
  "07": "7",
  "08": "8",
  "09": "9",
  "10": "10",
  "11": "page",
  "12": "knight",
  "13": "queen",
  "14": "king",
};

function cleanDividerLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/^[-─━ー＝=]{5,}$/.test(line.trim()))
    .join("\n")
    .trim();
}

function formatQuestionText(text: string) {
  return cleanDividerLines(text)
    .replace(/(?:^|\n)[①②③④⑤⑥⑦⑧⑨]\s*/g, "\n")
    .replace(/(?:^|\n)(\d+)[\.．、]\s*/g, "\n")
    .trim();
}

function removeDuplicateCardNameAtStart(body: string, card?: CardListItem) {
  if (!card) return body.trim();

  const normalized = body.replace(/\r\n/g, "\n").trim();
  const cardTitle = `${card.name_ja}（${card.orientation_ja}）`;

  const lines = normalized.split("\n");
  const firstLine = lines[0]?.trim();

  if (firstLine === cardTitle) {
    return lines.slice(1).join("\n").trim();
  }

  return normalized;
}

function parsePdfCardCode(code: string) {
  const trimmed = code.trim();

  const type = trimmed.slice(0, 1);
  const num = trimmed.slice(1, 3);
  const orientationCode = trimmed.slice(3, 4);

  const orientation_ja = orientationCode === "0" ? "正位置" : "逆位置";

  if (type === "0") {
    return {
      card_key: majorKeys[Number(num)],
      orientation_ja,
    };
  }

  return {
    card_key: `${suitMap[type]}_${rankMap[num]}`,
    orientation_ja,
  };
}

function parseSummarySections(text: string): SummarySection[] {
  const normalized = cleanDividerLines(text);

  const matches = Array.from(
    normalized.matchAll(
      /(?:^|\n)([①②③④⑤⑥⑦⑧⑨]|\d+)[\.．、\s]*([^\n]+)\n/g
    )
  );

  if (matches.length === 0) {
    return [
      {
        title: "鑑定結果",
        body: normalized.trim(),
      },
    ];
  }

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index ?? normalized.length
        : normalized.length;

    return {
      title: match[2].trim(),
      body: normalized.slice(start, end).trim(),
    };
  });
}

function parseDetailSections(
  text: string,
  cardList: CardListItem[]
): DetailSection[] {
  const normalized = cleanDividerLines(text);

  const matches = Array.from(
    normalized.matchAll(/(?:^|\n)(\d+)[\.．、\s]+([^\n]+?)\n/g)
  );

  if (matches.length === 0) {
    return [
      {
        title: "各カード詳細診断",
        body: normalized.trim(),
      },
    ];
  }

  return matches.map((match, index) => {
    const positionNo = Number(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index ?? normalized.length
        : normalized.length;

    const card =
      cardList.find((item) => item.position_no === positionNo) ??
      cardList[index];

    const rawBody = normalized.slice(start, end).trim();

    return {
      card,
      title: match[2].trim(),
      body: removeDuplicateCardNameAtStart(rawBody, card),
    };
  });
}

export default function PdfPage() {
  const [reading, setReading] = useState<LatestReading | null>(null);
  const [cardList, setCardList] = useState<CardListItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReading() {
      try {
        const response = await fetch("/api/latest-reading", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "最新鑑定結果を取得できませんでした。");
        }

        const savedReading = result.reading as LatestReading;
        setReading(savedReading);

        const parsedCards = savedReading.cards
          .split(/[,\n\s]+/)
          .map((v) => v.trim())
          .filter(Boolean)
          .map(parsePdfCardCode);

        const cardKeys = parsedCards.map((card) => card.card_key);

        const { data: cardData } = await supabase
          .from("tarot_cards")
          .select("card_key, name_ja, image_url")
          .in("card_key", cardKeys);

        const { data: positionData } = await supabase
          .from("tarot_spread_positions")
          .select("position_no, position_name")
          .eq("spread_key", savedReading.spread_key)
          .order("position_no", { ascending: true });

        const cardMap = new Map(
          (cardData ?? []).map((card) => [card.card_key, card])
        );

        const positionMap = new Map(
          (positionData ?? []).map((pos) => [
            pos.position_no,
            pos.position_name,
          ])
        );

        const list = parsedCards.map((card, index) => {
          const cardInfo = cardMap.get(card.card_key);

          return {
            position_no: index + 1,
            position_name: positionMap.get(index + 1) ?? "",
            name_ja: cardInfo?.name_ja ?? card.card_key,
            orientation_ja: card.orientation_ja,
            image_url: cardInfo?.image_url ?? null,
          };
        });

        setCardList(list);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }

    loadReading();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#120d1f] p-8 text-white">
        読み込み中...
      </main>
    );
  }

  if (error || !reading) {
    return (
      <main className="min-h-screen bg-[#120d1f] p-8 text-white">
        <div className="rounded-xl bg-red-950/60 p-4 text-red-100">
          {error || "鑑定結果がありません。"}
        </div>
      </main>
    );
  }

  const summarySections = parseSummarySections(reading.reading_summary ?? "");
  const detailSections = parseDetailSections(
    reading.reading_detail ?? "",
    cardList
  );

  return (
    <main className="min-h-screen bg-[#120d1f] px-6 py-8 text-[#2c1b10] print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }

          .no-print {
            display: none !important;
          }

          .print-page {
            break-after: page;
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
          }

          .print-page:last-child {
            break-after: auto;
          }

          .avoid-break {
            break-inside: avoid;
          }

          .detail-card-page {
            break-after: page;
          }

          .detail-card-page:last-child {
            break-after: auto;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="no-print mx-auto mb-6 flex max-w-[900px] items-center justify-between rounded-2xl bg-white/10 p-4 text-white">
        <div>
          <div className="text-lg font-bold">PDF出力プレビュー</div>
          <div className="text-sm opacity-80">
            表示内容を確認して、ブラウザの印刷からPDF保存してください。
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="rounded-xl bg-amber-400 px-5 py-2 font-bold text-stone-900"
        >
          PDF保存
        </button>
      </div>

      <article className="mx-auto max-w-[900px] space-y-8">
        <section className="print-page relative rounded-[28px] bg-[#fff8e7] p-10 shadow-2xl">
          <div className="absolute left-6 top-5 text-xs text-[#8b5a20]">
            作成日時：
            {new Date().toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
            })}
          </div>

          <div className="mb-8 rounded-[24px] border border-[#d8b15f] bg-[#1b1430] p-8 text-center text-[#f7e7b1]">
            <div className="text-sm tracking-[0.35em] text-[#d8b15f]">
              TAROT READING REPORT
            </div>

            <h1 className="mt-4 text-4xl font-bold">タロット鑑定書</h1>

            <div className="mt-5 text-lg text-[#fff6d6]">
              使用スプレッド名：{reading.spread_name}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-[#e3c988] bg-white/75 p-5">
              <div className="mb-2 text-sm font-bold text-[#8b5a20]">
                ご相談内容
              </div>

              <div className="whitespace-pre-wrap leading-7">
                {formatQuestionText(reading.question) || "未入力"}
              </div>
            </div>

            <div className="rounded-2xl border border-[#e3c988] bg-white/75 p-5">
              <div className="mb-2 text-sm font-bold text-[#8b5a20]">
                展開カード一覧
              </div>

              <div className="space-y-1 text-[13px] leading-6">
                {cardList.map((card) => (
                  <div key={card.position_no}>
                    {card.position_no}. {card.position_name}：
                    {card.name_ja}（{card.orientation_ja}）
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="print-page rounded-[28px] bg-[#fff8e7] p-10 shadow-2xl">
          <div className="rounded-[24px] border border-[#d8b15f] bg-white p-6">
            <div className="mb-5 text-center text-2xl font-bold text-[#8b5a20]">
              スプレッド展開図
            </div>

            {reading.spread_image_url ? (
              <img
                src={reading.spread_image_url}
                alt="スプレッド展開図"
                className="mx-auto max-h-[850px] w-full rounded-2xl object-contain"
              />
            ) : (
              <div className="rounded-xl bg-stone-100 p-8 text-center text-stone-500">
                展開図画像が保存されていません。
              </div>
            )}
          </div>
        </section>

        <section className="print-page rounded-[28px] bg-[#fff8e7] p-10 shadow-2xl">
          <div className="mb-6 border-b border-[#d8b15f] pb-4">
            <div className="text-sm tracking-[0.25em] text-[#8b5a20]">
              OVERALL READING
            </div>

            <h2 className="mt-2 text-3xl font-bold">鑑定結果</h2>
          </div>

          <div className="space-y-5">
            {summarySections.map((section, index) => (
              <div
                key={index}
                className="avoid-break rounded-2xl border border-[#ead8a6] bg-white/80 p-6"
              >
                <div className="mb-3 text-xl font-bold text-[#8b5a20]">
                  {section.title}
                </div>

                <div className="whitespace-pre-wrap leading-7">
                  {section.body}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="print-page rounded-[28px] bg-[#fff8e7] p-10 shadow-2xl">
          <div className="mb-6 border-b border-[#d8b15f] pb-4">
            <div className="text-sm tracking-[0.25em] text-[#8b5a20]">
              CARD DETAILS
            </div>

            <h2 className="mt-2 text-3xl font-bold">各カード詳細診断</h2>
          </div>

          <div className="space-y-8">
            {detailSections.map((section, index) => (
              <div
                key={index}
                className="detail-card-page rounded-[24px] border border-[#d8b15f] bg-white/85 p-7"
              >
                <div className="mb-5 border-b border-[#ead8a6] pb-4">
                  <div className="text-xl font-bold text-[#8b5a20]">
                    {section.card?.position_no}. {section.card?.position_name}
                  </div>

                  <div className="mt-1 text-lg font-bold">
                    {section.card?.name_ja}（{section.card?.orientation_ja}）
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-[170px_1fr]">
                  <div>
                    {section.card?.image_url && (
                      <img
                        src={section.card.image_url}
                        alt={section.card.name_ja}
                        className="mx-auto w-[165px] rounded-xl shadow-lg"
                      />
                    )}
                  </div>

                  <div className="whitespace-pre-wrap leading-7">
                    {section.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}