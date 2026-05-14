"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

type Spread = {
  spread_key: string;
  spread_name: string;
  card_count: number;
  image_url: string | null;
};

type Position = {
  spread_key: string;
  position_no: number;
  position_name: string;
  x_percent: number | null;
  y_percent: number | null;
  rotation_deg: number | null;
};

type TarotCard = {
  card_key: string;
  name_ja: string;
  image_url: string | null;
};

type DrawnCard = TarotCard & {
  input_code: string;
  orientation: "upright" | "reversed";
  orientation_ja: string;
  position_no: number;
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

function parseCardCode(code: string) {
  const trimmed = code.trim();

  if (!/^[0-4][0-9]{2}[0-1]$/.test(trimmed)) {
    throw new Error(`カードコード形式が不正です：${trimmed}`);
  }

  const type = trimmed.slice(0, 1);
  const num = trimmed.slice(1, 3);
  const orientationCode = trimmed.slice(3, 4);
  const orientation = orientationCode === "0" ? "upright" : "reversed";
  const orientation_ja = orientation === "upright" ? "正位置" : "逆位置";

  if (type === "0") {
    const n = Number(num);

    if (n < 0 || n > 21) {
      throw new Error(`大アルカナ番号が範囲外です：${trimmed}`);
    }

    return {
      input_code: trimmed,
      card_key: majorKeys[n],
      orientation,
      orientation_ja,
    };
  }

  const rank = rankMap[num];
  const suit = suitMap[type];

  if (!rank || !suit) {
    throw new Error(`小アルカナ番号が範囲外です：${trimmed}`);
  }

  return {
    input_code: trimmed,
    card_key: `${suit}_${rank}`,
    orientation,
    orientation_ja,
  };
}

function getCelticLabelPosition(positionNo: number) {
  const map: Record<number, { x: number; y: number }> = {
    1: { x: 44.5, y: 59 },
    2: { x: 31.5, y: 59 },
    3: { x: 38, y: 31 },
    4: { x: 38, y: 89 },
    5: { x: 18, y: 59 },
    6: { x: 58, y: 59 },
    7: { x: 91, y: 82 },
    8: { x: 91, y: 60 },
    9: { x: 91, y: 38 },
    10: { x: 91, y: 16 },
  };

  return map[positionNo];
}

function getVSpreadLabelPosition(positionNo: number) {
  const map: Record<number, { x: number; y: number }> = {
    1: { x: 50, y: 96 },
    2: { x: 38, y: 76 },
    3: { x: 62, y: 76 },
    4: { x: 27, y: 54 },
    5: { x: 73, y: 54 },
    6: { x: 16, y: 32 },
    7: { x: 84, y: 32 },
  };

  return map[positionNo];
}

function getHorseshoeLabelPosition(positionNo: number) {
  const map: Record<number, { x: number; y: number }> = {
    1: { x: 14, y: 39 },
    2: { x: 14, y: 68 },
    3: { x: 32, y: 82 },
    4: { x: 50, y: 92 },
    5: { x: 68, y: 82 },
    6: { x: 86, y: 68 },
    7: { x: 86, y: 39 },
  };

  return map[positionNo];
}

function getTreeOfLifeLabelPosition(positionNo: number) {
  const map: Record<number, { x: number; y: number }> = {
    1: { x: 56, y: 12 },
    6: { x: 56, y: 38 },
    9: { x: 56, y: 62 },
    10: { x: 56, y: 86 },

    3: { x: 18, y: 22 },
    5: { x: 18, y: 50 },
    8: { x: 18, y: 78 },

    2: { x: 82, y: 22 },
    4: { x: 82, y: 50 },
    7: { x: 82, y: 78 },
  };

  return map[positionNo];
}

function getHoroscopeLabelPosition(positionNo: number) {
  const map: Record<number, { x: number; y: number }> = {
    1: { x: 12, y: 64 },
    2: { x: 26, y: 74 },
    6: { x: 74, y: 74 },
    7: { x: 88, y: 64 },

    8: { x: 74, y: 26 },
    12: { x: 26, y: 26 },

    3: { x: 38, y: 61 },
    4: { x: 50, y: 70 },
    5: { x: 62, y: 61 },
    9: { x: 62, y: 39 },
    10: { x: 50, y: 30 },
    11: { x: 38, y: 39 },

    13: { x: 62, y: 50 },
  };

  return map[positionNo];
}

function getStarOfDavidLabelPosition(positionNo: number) {
  const map: Record<number, { x: number; y: number }> = {
    1: { x: 50, y: 34 },
    2: { x: 16, y: 36 },
    3: { x: 16, y: 66 },
    4: { x: 84, y: 66 },
    5: { x: 84, y: 36 },
    6: { x: 50, y: 94 },
  };

  return map[positionNo];
}

function adjustDisplayPosition(spreadKey: string, x: number, y: number) {
  if (spreadKey === "greek_cross") {
    return { x, y: Math.max(0, y - 4) };
  }

  return { x, y };
}

function getLabelTranslateClass(spreadKey: string, positionNo: number) {
  if (spreadKey === "v_spread" && [2, 4, 6].includes(positionNo)) {
    return "-translate-x-full";
  }

  if (spreadKey === "v_spread" && [3, 5, 7].includes(positionNo)) {
    return "translate-x-0";
  }

  if (spreadKey === "tree_of_life" && [3, 5, 8].includes(positionNo)) {
    return "-translate-x-full";
  }

  if (
    spreadKey === "tree_of_life" &&
    [1, 2, 4, 6, 7, 9, 10].includes(positionNo)
  ) {
    return "translate-x-0";
  }

  if (spreadKey === "horoscope" && positionNo === 13) {
    return "translate-x-0";
  }

  if (spreadKey === "star_of_david" && [2, 3].includes(positionNo)) {
    return "-translate-x-full";
  }

  if (spreadKey === "star_of_david" && [4, 5].includes(positionNo)) {
    return "translate-x-0";
  }

  return "-translate-x-1/2";
}

function HomeContent() {
  const searchParams = useSearchParams();

  const [spreads, setSpreads] = useState<Spread[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedSpreadKey, setSelectedSpreadKey] = useState("celtic_cross");
  const [cardCodesText, setCardCodesText] = useState(
    "0000,0011,2010,3050,4100,1120,2031,3040,0100,2020"
  );
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [error, setError] = useState("");
  const [autoLoaded, setAutoLoaded] = useState(false);

  const selectedSpread = useMemo(
    () => spreads.find((s) => s.spread_key === selectedSpreadKey),
    [spreads, selectedSpreadKey]
  );

  const selectedPositions = useMemo(
    () =>
      positions
        .filter((p) => p.spread_key === selectedSpreadKey)
        .sort((a, b) => a.position_no - b.position_no),
    [positions, selectedSpreadKey]
  );

  useEffect(() => {
    async function load() {
      const { data: spreadData, error: spreadError } = await supabase
        .from("tarot_spreads")
        .select("spread_key, spread_name, card_count, image_url")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (spreadError) {
        setError(spreadError.message);
        return;
      }

      const { data: posData, error: posError } = await supabase
        .from("tarot_spread_positions")
        .select(
          "spread_key, position_no, position_name, x_percent, y_percent, rotation_deg"
        )
        .order("position_no", { ascending: true });

      if (posError) {
        setError(posError.message);
        return;
      }

      setSpreads(spreadData ?? []);
      setPositions(posData ?? []);
    }

    load();
  }, []);

  async function previewCards(spreadKey: string, cardsText: string) {
    setError("");

    const spread = spreads.find((s) => s.spread_key === spreadKey);

    if (!spread) {
      throw new Error("スプレッドが見つかりません。");
    }

    const parsed = cardsText
      .split(/[,\n\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map(parseCardCode);

    if (parsed.length !== spread.card_count) {
      throw new Error(
        `必要枚数は${spread.card_count}枚です。入力は${parsed.length}枚です。`
      );
    }

    const cardKeys = parsed.map((p) => p.card_key);

    const { data: cardData, error: cardError } = await supabase
      .from("tarot_cards")
      .select("card_key, name_ja, image_url")
      .in("card_key", cardKeys);

    if (cardError) {
      throw new Error(cardError.message);
    }

    const cardMap = new Map((cardData ?? []).map((c) => [c.card_key, c]));

    const result = parsed.map((p, index) => {
      const card = cardMap.get(p.card_key);

      if (!card) {
        throw new Error(`カードDBに存在しません：${p.card_key}`);
      }

      return {
        ...card,
        input_code: p.input_code,
        orientation: p.orientation as "upright" | "reversed",
        orientation_ja: p.orientation_ja,
        position_no: index + 1,
      };
    });

    setDrawnCards(result);
  }

  async function handlePreview() {
    try {
      await previewCards(selectedSpreadKey, cardCodesText);
    } catch (e) {
      setError(String(e));
      setDrawnCards([]);
    }
  }

  useEffect(() => {
    async function autoPreviewFromUrl() {
      if (autoLoaded) return;
      if (spreads.length === 0 || positions.length === 0) return;

      const spreadFromUrl = searchParams.get("spread");
      const cardsFromUrl = searchParams.get("cards");

      if (!spreadFromUrl || !cardsFromUrl) return;

      const decodedCards = decodeURIComponent(cardsFromUrl);

      setSelectedSpreadKey(spreadFromUrl);
      setCardCodesText(decodedCards);
      setAutoLoaded(true);

      try {
        await previewCards(spreadFromUrl, decodedCards);
      } catch (e) {
        setError(String(e));
        setDrawnCards([]);
      }
    }

    autoPreviewFromUrl();
  }, [autoLoaded, searchParams, spreads, positions]);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}?spread=${encodeURIComponent(
          selectedSpreadKey
        )}&cards=${encodeURIComponent(cardCodesText.replace(/\s+/g, ""))}`
      : "";

  return (
    <main className="min-h-screen bg-[#fdf7db] p-6 text-stone-800">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">タロットWEB表示テスト</h1>
          <p className="mt-2 text-sm">
            Supabaseのスプレッド座標とカード画像を使って、展開図を表示します。
          </p>
        </header>

        <section className="rounded-2xl bg-white p-4 shadow">
          <label className="block text-sm font-bold">スプレッド</label>
          <select
            className="mt-2 w-full rounded-lg border p-2"
            value={selectedSpreadKey}
            onChange={(e) => {
              setSelectedSpreadKey(e.target.value);
              setDrawnCards([]);
              setError("");
            }}
          >
            {spreads.map((spread) => (
              <option key={spread.spread_key} value={spread.spread_key}>
                {spread.spread_name}（{spread.card_count}枚）
              </option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-bold">カードコード</label>
          <textarea
            className="mt-2 h-28 w-full rounded-lg border p-2"
            value={cardCodesText}
            onChange={(e) => setCardCodesText(e.target.value)}
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handlePreview}
              className="rounded-xl bg-stone-800 px-5 py-2 text-white"
            >
              展開表示
            </button>

            {drawnCards.length > 0 && (
              <button
                onClick={() => navigator.clipboard.writeText(shareUrl)}
                className="rounded-xl border px-5 py-2"
              >
                展開URLをコピー
              </button>
            )}
          </div>

          {drawnCards.length > 0 && (
            <p className="mt-3 break-all rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
              {shareUrl}
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-4 text-xl font-bold">
            {spreads.find((s) => s.spread_key === selectedSpreadKey)
              ?.spread_name ?? "スプレッド"}
          </h2>

          <div className="relative mx-auto h-[980px] w-full max-w-[1320px] overflow-visible rounded-2xl border bg-[#fffdf6]">
            {selectedPositions.map((pos) => {
              const card = drawnCards.find(
                (c) => c.position_no === pos.position_no
              );

              const rawX = pos.x_percent ?? 50;
              const rawY = pos.y_percent ?? 50;
              const { x, y } = adjustDisplayPosition(
                selectedSpreadKey,
                rawX,
                rawY
              );

              const baseRotation = pos.rotation_deg ?? 0;
              const reverseRotation = card?.orientation === "reversed" ? 180 : 0;
              const finalRotation = baseRotation + reverseRotation;

              let labelPos: { x: number; y: number } | undefined;

              if (selectedSpreadKey === "celtic_cross") {
                labelPos = getCelticLabelPosition(pos.position_no);
              }

              if (selectedSpreadKey === "v_spread") {
                labelPos = getVSpreadLabelPosition(pos.position_no);
              }

              if (selectedSpreadKey === "horseshoe") {
                labelPos = getHorseshoeLabelPosition(pos.position_no);
              }

              if (selectedSpreadKey === "tree_of_life") {
                labelPos = getTreeOfLifeLabelPosition(pos.position_no);
              }

              if (selectedSpreadKey === "horoscope") {
                labelPos = getHoroscopeLabelPosition(pos.position_no);
              }

              if (selectedSpreadKey === "star_of_david") {
                labelPos = getStarOfDavidLabelPosition(pos.position_no);
              }

              const adjustedLabelPos = labelPos
                ? adjustDisplayPosition(
                    selectedSpreadKey,
                    labelPos.x,
                    labelPos.y
                  )
                : undefined;

              const labelX = adjustedLabelPos?.x ?? x;
              const labelY = adjustedLabelPos?.y ?? y + 14;

              return (
                <div key={`${selectedSpreadKey}-${pos.position_no}`}>
                  <div
                    className="absolute z-10"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {card?.image_url ? (
                      <img
                        src={card.image_url}
                        alt={card.name_ja}
                        className="h-[160px] w-[92px] rounded-md object-cover shadow-lg md:h-[190px] md:w-[110px]"
                        style={{
                          transform: `rotate(${finalRotation}deg)`,
                        }}
                      />
                    ) : (
                      <div
                        className="flex h-[160px] w-[92px] items-center justify-center rounded-md border bg-sky-100 text-xl font-bold md:h-[190px] md:w-[110px]"
                        style={{
                          transform: `rotate(${baseRotation}deg)`,
                        }}
                      >
                        {pos.position_no}
                      </div>
                    )}
                  </div>

                  <div
                    className={`absolute z-30 w-[142px] -translate-y-1/2 rounded-lg bg-white/95 px-2 py-1 text-center text-[11px] leading-tight shadow ${getLabelTranslateClass(
                      selectedSpreadKey,
                      pos.position_no
                    )}`}
                    style={{
                      left: `${labelX}%`,
                      top: `${labelY}%`,
                    }}
                  >
                    <div className="font-bold">
                      {pos.position_no}. {pos.position_name}
                    </div>

                    {card && (
                      <>
                        <div>{card.name_ja}</div>
                        <div>{card.orientation_ja}</div>
                        {!card.image_url && (
                          <div className="text-[10px] text-red-600">
                            image_urlなし
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
