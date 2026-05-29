"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { toPng } from "html-to-image";
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

    3: { x: 38, y: 91 },
    4: { x: 50, y: 70 },
    5: { x: 62, y: 91 },
    9: { x: 62, y: 8 },
    10: { x: 50, y: 30 },
    11: { x: 38, y: 8 },

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
  const [question, setQuestion] = useState("");
  const [readingSummary, setReadingSummary] = useState("");
  const [readingDetail, setReadingDetail] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const spreadRef = useRef<HTMLDivElement | null>(null);
  const [imageSaving, setImageSaving] = useState(false);
  const [imageSaveMessage, setImageSaveMessage] = useState("");

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

  async function handleSaveReading() {
    try {
      setSaving(true);
      setSaveMessage("");
      setError("");

      const response = await fetch("/api/save-reading", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "tarot_save_take6730",
        },
        body: JSON.stringify({
          spread_key: selectedSpreadKey,
          spread_name: selectedSpread?.spread_name ?? "",
          question: question,
          cards: cardCodesText.replace(/\s+/g, ""),
          reading_summary: readingSummary,
          reading_detail: readingDetail,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "保存エラー");
      }

      setSaveMessage("鑑定結果を保存しました。");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSpreadImage() {
    try {
      if (!spreadRef.current) {
        throw new Error("展開図が見つかりません。");
      }

      setImageSaving(true);
      setImageSaveMessage("");
      setError("");

      const dataUrl = await toPng(spreadRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });

      const blob = await (await fetch(dataUrl)).blob();

      const filePath = "latest-spread.png";

      const { error: uploadError } = await supabase.storage
        .from("tarot-generated")
        .upload(filePath, blob, {
          upsert: true,
          contentType: "image/png",
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from("tarot-generated")
        .getPublicUrl(filePath);

      const imageUrl = data.publicUrl;

      const response = await fetch("/api/save-reading", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "tarot_save_take6730",
        },
        body: JSON.stringify({
          spread_key: selectedSpreadKey,
          spread_name: selectedSpread?.spread_name ?? "",
          question: question,
          cards: cardCodesText.replace(/\s+/g, ""),
          reading_summary: readingSummary,
          reading_detail: readingDetail,
          spread_image_url: imageUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "画像URL保存エラー");
      }

      setImageSaveMessage("展開図画像を保存しました。");
    } catch (e) {
      setError(String(e));
    } finally {
      setImageSaving(false);
    }
  }

  useEffect(() => {
    async function autoPreviewFromUrl() {
      if (autoLoaded) return;
      if (spreads.length === 0 || positions.length === 0) return;

      const spreadFromUrl = searchParams.get("spread");
      const cardsFromUrl = searchParams.get("cards");

      if (!spreadFromUrl) return;

      setSelectedSpreadKey(spreadFromUrl);

      if (!cardsFromUrl) {
        setDrawnCards([]);
        setAutoLoaded(true);
        return;
      }

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
          <h1 className="text-3xl font-bold">タロット_スプレッド展開図</h1>
          <p className="mt-2 text-sm">
            選択したスプレッドに合わせて展開したカードの展開図を表示します。
          </p>
        </header>

        <section className="rounded-2xl bg-white p-4 shadow">
          <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <div>
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

              <label className="mt-4 block text-sm font-bold">
                カードコード
              </label>

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
            </div>

            <div className="rounded-2xl border bg-stone-50 p-4 text-sm leading-7">
              <h3 className="mb-3 text-lg font-bold">
                【カードコードのルール】
              </h3>

              <div className="space-y-3">
                <div>
                  <div className="font-bold">1桁目：カード種別</div>
                  <div>
                    0：大アルカナ / 1：ワンド / 2：カップ /
                    3：ソード / 4：ペンタクル
                  </div>
                </div>

                <div>
                  <div className="font-bold">2〜3桁目：番号</div>
                  <div>
                    （大アルカナ：00〜21 / 小アルカナ：01〜14）
                  </div>
                </div>

                <div>
                  <div className="font-bold">4桁目：正逆</div>
                  <div>0：正位置 / 1：逆位置</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-4 text-xl font-bold">鑑定結果保存</h2>

          <label className="block text-sm font-bold">相談内容</label>

          <textarea
            className="mt-2 h-24 w-full rounded-lg border p-3"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例）相手は私のことをどう思っていますか？"
          />

          <label className="block text-sm font-bold">鑑定結果</label>

          <textarea
            className="mt-2 h-48 w-full rounded-lg border p-3"
            value={readingSummary}
            onChange={(e) => setReadingSummary(e.target.value)}
          />

          <label className="mt-6 block text-sm font-bold">
            ⑨ 各カード詳細診断
          </label>

          <textarea
            className="mt-2 h-72 w-full rounded-lg border p-3"
            value={readingDetail}
            onChange={(e) => setReadingDetail(e.target.value)}
          />

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              onClick={handleSaveReading}
              disabled={saving}
              className="rounded-xl bg-indigo-700 px-5 py-2 text-white disabled:opacity-50"
            >
              {saving ? "保存中..." : "鑑定結果を保存"}
            </button>

            {saveMessage && (
              <div className="text-sm text-green-700">{saveMessage}</div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              onClick={handleSaveSpreadImage}
              disabled={imageSaving}
              className="rounded-xl bg-emerald-700 px-5 py-2 text-white disabled:opacity-50"
            >
              {imageSaving
                ? "展開図画像を保存中..."
                : "展開図画像を保存"}
            </button>

            {imageSaveMessage && (
              <div className="text-sm text-green-700">
                {imageSaveMessage}
              </div>
            )}
          </div>

          <div className="mt-4">
            <a
              href="/pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl bg-amber-500 px-5 py-2 font-bold text-stone-900"
            >
              PDF用ページを開く
            </a>
         </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-4 text-xl font-bold">
            {spreads.find((s) => s.spread_key === selectedSpreadKey)
              ?.spread_name ?? "スプレッド"}
          </h2>

          <div
            ref={spreadRef}
            className="relative mx-auto h-[980px] w-full max-w-[1320px] overflow-visible rounded-2xl border bg-[#fffdf6]"
          >
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

              if (selectedSpreadKey === "horoscope" ||
                selectedSpreadKey === "horoscope_house") {
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