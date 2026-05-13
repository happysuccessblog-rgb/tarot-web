"use client";

import { useEffect, useMemo, useState } from "react";
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
    // 1枚目・2枚目：中心縦軸を境に左右表示
    1: { x: 44.5, y: 59 },
    2: { x: 31.5, y: 59 },

    // 3枚目・4枚目：カードから離して下側に表示
    3: { x: 38, y: 31 },
    4: { x: 38, y: 89 },

    // 5枚目・6枚目：カード縦軸中心とラベル中心を一致
    5: { x: 18, y: 59 },
    6: { x: 58, y: 59 },

    // 7〜10枚目：カード横軸中心とラベル中心を一致
    7: { x: 91, y: 82 },
    8: { x: 91, y: 60 },
    9: { x: 91, y: 38 },
    10: { x: 91, y: 16 },
  };

  return map[positionNo];
}

export default function Home() {
  const [spreads, setSpreads] = useState<Spread[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedSpreadKey, setSelectedSpreadKey] = useState("celtic_cross");
  const [cardCodesText, setCardCodesText] = useState(
    "0000,0011,2010,3050,4100,1120,2031,3040,0100,2020"
  );
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [error, setError] = useState("");

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

  async function handlePreview() {
    setError("");

    try {
      const parsed = cardCodesText
        .split(/[,\n\s]+/)
        .map((v) => v.trim())
        .filter(Boolean)
        .map(parseCardCode);

      if (!selectedSpread) {
        throw new Error("スプレッドが選択されていません。");
      }

      if (parsed.length !== selectedSpread.card_count) {
        throw new Error(
          `必要枚数は${selectedSpread.card_count}枚です。入力は${parsed.length}枚です。`
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
    } catch (e) {
      setError(String(e));
      setDrawnCards([]);
    }
  }

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

          <button
            onClick={handlePreview}
            className="mt-4 rounded-xl bg-stone-800 px-5 py-2 text-white"
          >
            展開表示
          </button>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-4 text-xl font-bold">
            {selectedSpread?.spread_name ?? "スプレッド"}
          </h2>

          <div className="relative mx-auto h-[980px] w-full max-w-[1320px] overflow-visible rounded-2xl border bg-[#fffdf6]">
            {selectedPositions.map((pos) => {
              const card = drawnCards.find(
                (c) => c.position_no === pos.position_no
              );

              const x = pos.x_percent ?? 50;
              const y = pos.y_percent ?? 50;

              const baseRotation = pos.rotation_deg ?? 0;
              const reverseRotation = card?.orientation === "reversed" ? 180 : 0;
              const finalRotation = baseRotation + reverseRotation;

              const labelPos =
                selectedSpreadKey === "celtic_cross"
                  ? getCelticLabelPosition(pos.position_no)
                  : undefined;

              const labelX = labelPos?.x ?? x;
              const labelY = labelPos?.y ?? y + 14;

              return (
                <div key={pos.position_no}>
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
                    className="absolute z-30 w-[142px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/95 px-2 py-1 text-center text-[11px] leading-tight shadow"
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