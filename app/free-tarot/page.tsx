"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Category = {
  category_key: string;
  category_name: string;
};

type Topic = {
  category_key: string;
  topic_key: string;
  topic_name: string;
};

type Subtopic = {
  category_key: string;
  topic_key: string;
  subtopic_key: string;
  subtopic_name: string;
};

type Spread = {
  spread_key: string;
  spread_name: string;
  card_count: number;
};

type ReadingCard = {
  position_no: number;
  position_name: string;
  card_key: string;
  card_name?: string;
  name_ja?: string;
  orientation_name?: string;
  orientation_ja?: string;
  image_url?: string | null;
  interpretation_text?: string;
  position_adjusted_text?: string;
  combination_adjusted_text?: string;
};

type ReadingResult = {
  reading_key: string;
  final_reading_text: string;
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
  position_subject?: string | null;
  subject_note?: string | null;
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

const loadingMessages = [
  "カードを整えています…",
  "カードを展開しています…",
  "鑑定文をまとめています…",
  "結果を表示しています…",
];

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? `${path} failed`);
  }

  return data;
}

async function getJson(path: string) {
  const response = await fetch(path, {
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? `${path} failed`);
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const SPREAD_CENTER_X = 50;
const SPREAD_CENTER_Y = 54;
const SPREAD_SCALE = 1.3;
const SPREAD_OFFSET_X = 5;
const SPREAD_OFFSET_Y = 12;

function mapSpreadX(x: number) {
  return clamp(
    SPREAD_CENTER_X + (x - SPREAD_CENTER_X) * SPREAD_SCALE + SPREAD_OFFSET_X,
    8,
    92
  );
}

function mapSpreadY(y: number) {
  return clamp(
    SPREAD_CENTER_Y + (y - SPREAD_CENTER_Y) * SPREAD_SCALE + SPREAD_OFFSET_Y,
    18,
    90
  );
}

function isRightSideColumn(positionNo: number) {
  return positionNo >= 7 && positionNo <= 10;
}

function isCelticCross(spreadKey?: string) {
  return spreadKey === "celtic_cross" || spreadKey === "celtic";
}

function mapRightColumnY(positionNo: number) {
  const rightColumnMap: Record<number, number> = {
    10: 22,
    9: 41,
    8: 60,
    7: 79,
  };

  return rightColumnMap[positionNo] ?? 50;
}

function mapCelticCrossY(positionNo: number, y: number) {
  const celticMap: Record<number, number> = {
    3: 27,
    4: 75,
  };

  return celticMap[positionNo] ?? mapSpreadY(y);
}

function parseReadingTextSections(
  text: string,
  cards: ReadingCard[]
): ReadingTextSection[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  const matches = Array.from(
    normalized.matchAll(/(?:^|\n)■\s*([^\n]+)\n/g)
  );

  if (matches.length === 0) {
    return [
      {
        title: "鑑定文",
        body: normalized,
      },
    ];
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

    return {
      title,
      body,
      card,
    };
  });
}

export default function FreeTarotPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [spreads, setSpreads] = useState<Spread[]>([]);

  const [categoryKey, setCategoryKey] = useState("");
  const [topicKey, setTopicKey] = useState("");
  const [subtopicKey, setSubtopicKey] = useState("");
  const [spreadKey, setSpreadKey] = useState("");
  const [questionText, setQuestionText] = useState("");

  const [loadingMaster, setLoadingMaster] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");

  const [reading, setReading] = useState<ReadingResult | null>(null);
  const [cards, setCards] = useState<ReadingCard[]>([]);
  const [spreadPositions, setSpreadPositions] = useState<SpreadPosition[]>([]);

  useEffect(() => {
    async function loadMasterData() {
      setError("");
      setLoadingMaster(true);

      const data = await getJson("/api/prod/free-tarot/options");

      setCategories(data.categories ?? []);
      setTopics(data.topics ?? []);
      setSubtopics(data.subtopics ?? []);
      setSpreads(data.spreads ?? []);
    }

    loadMasterData()
      .catch((e) => {
        setError(String(e));
      })
      .finally(() => {
        setLoadingMaster(false);
      });
  }, []);

  const filteredTopics = useMemo(() => {
    return topics.filter((topic) => topic.category_key === categoryKey);
  }, [topics, categoryKey]);

  const filteredSubtopics = useMemo(() => {
    return subtopics.filter(
      (subtopic) =>
        subtopic.category_key === categoryKey &&
        subtopic.topic_key === topicKey
    );
  }, [subtopics, categoryKey, topicKey]);

  const canSubmit =
    categoryKey &&
    topicKey &&
    subtopicKey &&
    spreadKey &&
    questionText.trim().length > 0;

  const readingSections = reading
    ? parseReadingTextSections(reading.final_reading_text, cards)
    : [];

  async function handleSubmit() {
    if (!canSubmit || loading) return;

    setLoading(true);
    setError("");
    setReading(null);
    setCards([]);
    setSpreadPositions([]);
    setLoadingStep(0);

    try {
      setLoadingStep(0);

      const created = await postJson("/api/prod/readings/create-from-jobs", {
        category_key: categoryKey,
        topic_key: topicKey,
        subtopic_key: subtopicKey,
        spread_key: spreadKey,
        question_text: questionText,
      });

      const readingKey = created.reading_key;

      if (!readingKey) {
        throw new Error("reading_key が取得できませんでした。");
      }

      setLoadingStep(1);
      setLoadingStep(2);

      const composed = await postJson("/api/prod/readings/compose", {
        reading_key: readingKey,
      });

      setLoadingStep(3);

      const result = await getJson(
        `/api/prod/free-tarot/result?reading_key=${encodeURIComponent(
          readingKey
        )}`
      );

      const resultSpreadKey = result.reading?.spread_key ?? spreadKey;

      const layout = await getJson(
        `/api/prod/free-tarot/spread-layout?spread_key=${encodeURIComponent(
          resultSpreadKey
        )}`
      );

      setReading({
        reading_key: readingKey,
        final_reading_text:
          composed.final_reading_text ??
          result.reading?.final_reading_text ??
          "",
        spread_key: resultSpreadKey,
        spread_name: result.reading?.spread_name,
        spread_image_url: result.reading?.spread_image_url ?? null,
        category_name: result.reading?.category_name,
        topic_name: result.reading?.topic_name,
        subtopic_name: result.reading?.subtopic_name,
      });

      setCards(result.cards ?? []);
      setSpreadPositions(layout.positions ?? []);
      router.push(`/free-tarot/result/${readingKey}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#120d1f] px-5 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <section className="mb-8 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl">
          <div className="text-sm tracking-[0.35em] text-amber-300">
            FREE TAROT
          </div>

          <h1 className="mt-3 text-3xl font-bold">無料タロット占い</h1>

          <p className="mt-3 text-sm leading-7 text-white/75">
            相談内容に合わせてカードを展開し、今の流れを占います。
          </p>
        </section>

        <section className="grid gap-5 rounded-3xl bg-white p-6 text-stone-900 shadow-2xl">
          {loadingMaster && (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              選択肢を読み込んでいます...
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-bold">占いカテゴリ</label>
            <select
              value={categoryKey}
              onChange={(e) => {
                setCategoryKey(e.target.value);
                setTopicKey("");
                setSubtopicKey("");
              }}
              className="w-full rounded-xl border p-3"
              disabled={loadingMaster}
            >
              <option value="">選択してください</option>
              {categories.map((category) => (
                <option
                  key={category.category_key}
                  value={category.category_key}
                >
                  {category.category_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">相談テーマ</label>
            <select
              value={topicKey}
              onChange={(e) => {
                setTopicKey(e.target.value);
                setSubtopicKey("");
              }}
              disabled={!categoryKey || loadingMaster}
              className="w-full rounded-xl border p-3 disabled:bg-stone-100"
            >
              <option value="">選択してください</option>
              {filteredTopics.map((topic) => (
                <option key={topic.topic_key} value={topic.topic_key}>
                  {topic.topic_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">詳細テーマ</label>
            <select
              value={subtopicKey}
              onChange={(e) => setSubtopicKey(e.target.value)}
              disabled={!topicKey || loadingMaster}
              className="w-full rounded-xl border p-3 disabled:bg-stone-100"
            >
              <option value="">選択してください</option>
              {filteredSubtopics.map((subtopic) => (
                <option
                  key={subtopic.subtopic_key}
                  value={subtopic.subtopic_key}
                >
                  {subtopic.subtopic_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">スプレッド</label>
            <select
              value={spreadKey}
              onChange={(e) => setSpreadKey(e.target.value)}
              className="w-full rounded-xl border p-3"
              disabled={loadingMaster}
            >
              <option value="">選択してください</option>
              {spreads.map((spread) => (
                <option key={spread.spread_key} value={spread.spread_key}>
                  {spread.spread_name}（{spread.card_count}枚）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">
              相談したいこと
            </label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="例：相手は私のことをどう思っていますか？"
              className="min-h-[130px] w-full rounded-xl border p-3 leading-7"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit || loading || loadingMaster}
            className="rounded-2xl bg-amber-400 px-6 py-4 font-bold text-stone-950 disabled:opacity-40"
          >
            {loading ? "占っています..." : "占う"}
          </button>
        </section>

        {loading && (
          <section className="mt-8 rounded-3xl border border-amber-300/30 bg-white/10 p-6 text-center shadow-2xl">
            <div className="text-lg font-bold text-amber-200">
              {loadingMessages[loadingStep]}
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-amber-300 transition-all"
                style={{
                  width: `${
                    ((loadingStep + 1) / loadingMessages.length) * 100
                  }%`,
                }}
              />
            </div>
          </section>
        )}

        {reading && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl bg-[#fff8e7] p-6 text-stone-900 shadow-2xl">
              <div className="text-sm font-bold text-amber-700">鑑定結果</div>

              <h2 className="mt-2 text-2xl font-bold">
                {reading.spread_name ?? "タロット占い"}
              </h2>

              <div className="mt-2 text-sm text-stone-600">
                {reading.category_name} / {reading.topic_name} /{" "}
                {reading.subtopic_name}
              </div>
            </div>

            {spreadPositions.length > 0 && cards.length > 0 && (
              <div className="rounded-3xl bg-[#1b1430] p-6 text-white shadow-2xl">
                <h3 className="mb-6 text-3xl font-bold text-amber-200">
                  スプレッド展開図
                </h3>

                <div className="relative mx-auto h-[1100px] w-full overflow-hidden rounded-3xl border border-amber-300/30 bg-[#120d1f]">
                  {spreadPositions.map((position) => {
                    const card = cards.find(
                      (item) => item.position_no === position.position_no
                    );

                    if (!card) return null;

                    const cardName = getCardName(card);
                    const orientationName = getOrientationName(card);
                    const rightColumn = isRightSideColumn(position.position_no);

                    return (
                      <div
                        key={position.position_no}
                        className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                        style={{
                          left: `${mapSpreadX(position.x_percent)}%`,
                          top: `${
                            isRightSideColumn(position.position_no)
                              ? mapRightColumnY(position.position_no)
                              : isCelticCross(reading?.spread_key)
                                ? mapCelticCrossY(
                                    position.position_no,
                                    position.y_percent
                                  )
                                : mapSpreadY(position.y_percent)
                          }%`,
                          transform: `translate(-50%, -50%) rotate(${position.rotation_deg}deg)`,
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
                              <div className="mt-1 text-white/90">
                                {cardName}
                              </div>
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

                            {card.image_url ? (
                              <img
                                src={card.image_url}
                                alt={`${cardName}（${orientationName}）`}
                                className={`mx-auto w-[86px] rounded-xl shadow-2xl transition-transform ${
                                  isReversed(card) ? "rotate-180" : ""
                                }`}
                              />
                            ) : (
                              <div className="mx-auto flex h-[138px] w-[86px] items-center justify-center rounded-xl border border-amber-300/40 bg-white/10 text-[10px]">
                                {cardName}
                              </div>
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
                <h3 className="mb-4 text-xl font-bold">スプレッド画像</h3>

                <img
                  src={reading.spread_image_url}
                  alt="スプレッド画像"
                  className="mx-auto max-h-[760px] w-full rounded-2xl object-contain"
                />
              </div>
            )}

            <div className="rounded-3xl bg-[#fff8e7] p-6 text-stone-900 shadow-2xl">
              <h3 className="mb-6 text-2xl font-bold">鑑定文</h3>

              <div className="space-y-6">
                {readingSections.map((section, index) => {
                  const card = section.card;
                  const cardName = card ? getCardName(card) : "";
                  const orientationName = card ? getOrientationName(card) : "";

                  return (
                    <section
                      key={`${section.title}-${index}`}
                      className="rounded-2xl border border-[#ead8a6] bg-white/80 p-5"
                    >
                      <h4 className="mb-4 text-xl font-bold text-amber-800">
                        ■ {section.title}
                      </h4>

                      {card ? (
                        <div className="grid gap-5 md:grid-cols-[140px_1fr]">
                          <div className="text-center">
                            {card.image_url && (
                              <img
                                src={card.image_url}
                                alt={`${cardName}（${orientationName}）`}
                                className={`mx-auto w-28 rounded-xl shadow-lg transition-transform ${
                                  isReversed(card) ? "rotate-180" : ""
                                }`}
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
          </section>
        )}
      </div>
    </main>
  );
}