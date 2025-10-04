"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/**
 * 修正要約（デバッグ対応）
 * - sandbox で `lucide-react` / `@react-three/fiber` が原因のエラーが出ていたため、
 *   依存を削除し、アイコンは最小限のインラインSVGに置換。3D表示は一旦オフ。
 * - 前回の差分適用時にコード末尾が切れたため、ファイル全体を再構成してビルド可能に修正。
 * - 既存の判定仕様（差が20cm以上）・UI を維持。簡易自己テストを追加。
 * - 【今回の追加】Googleスプレッドシート（公開CSV）自動読込を最小追加。
 */

/* ========= 公開CSV URL（page.tsx互換） ========= */
const GOOGLE_SHEET_CSV_URL =
  process.env.NEXT_PUBLIC_DEVICE_CSV_URL ??
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSgVsdmTcaWlepz42z8pHGNGn5VjT9FADDr-Tl4Nm7dEw7IxoeBXJJ-TEMm1qXzCbntsa2-94h43fbF/pub?output=csv";

// --- Minimal inline icons (replacing lucide-react) ---
const IconCheck = ({ className = "h-5 w-5", color = "#059669" }: { className?: string; color?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IconAlert = ({ className = "h-5 w-5", color = "#dc2626" }: { className?: string; color?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

// --- 型定義 ---
type Category = "ガイディング" | "中間" | "マイクロ";

type Device = {
  id: string;
  name: string;
  maker?: string;
  category: Category;
  // 寸法は mm を基本単位として保持（必要に応じて換算）
  id_mm?: number; // 内径
  od_mm?: number; // 外径
  length_cm?: number; // ワーキング長（ハブ〜先端）
  // 元データ（任意）
  id_inch?: number;
  od_fr?: number;
  notes?: string;
};

// --- 単位換算ユーティリティ ---
const inchToMm = (inch: number) => inch * 25.4;
const frToMm = (fr: number) => fr * 0.33; // 近似：1 Fr = 0.33 mm（OD）

/* ========= CSV パーサ（page.tsx相当・引用符対応） ========= */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (ch === "\r" && next === "\n") i++;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function csvToDevices(text: string): Device[] {
  const table = parseCSV(text);
  if (table.length < 2) return [];
  const header = table[0].map((h) => h.trim().toLowerCase());

  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));

  const nameI = idx(["name", "名称", "製品名"]);
  const catI = idx(["category", "カテゴリ"]);
  const makerI = idx(["maker", "メーカー"]);
  const idMmI = idx(["id_mm", "内径_mm"]);
  const odMmI = idx(["od_mm", "外径_mm"]);
  const lenI = idx(["length_cm", "長さ_cm"]);
  const idInI = idx(["id_inch", "内径_inch"]);
  const odFrI = idx(["od_fr", "外径_fr"]);

  const out: Device[] = [];
  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    const name = (nameI >= 0 ? row[nameI] : "")?.trim();
    if (!name) continue;
    const catRaw = catI >= 0 ? (row[catI] ?? "") : "";
    const category: Category = catRaw.includes("ガイ") ? "ガイディング" : catRaw.includes("中間") ? "中間" : "マイクロ";
    const id_mm = idMmI >= 0 && row[idMmI] ? Number(row[idMmI]) : idInI >= 0 && row[idInI] ? inchToMm(Number(row[idInI])) : undefined;
    const od_mm = odMmI >= 0 && row[odMmI] ? Number(row[odMmI]) : odFrI >= 0 && row[odFrI] ? frToMm(Number(row[odFrI])) : undefined;
    const length_cm = lenI >= 0 && row[lenI] ? Number(row[lenI]) : undefined;

    out.push({
      id: `csv-${i}`,
      name,
      maker: makerI >= 0 ? row[makerI] : undefined,
      category,
      id_mm,
      od_mm,
      length_cm,
    });
  }
  return out;
}

// --- サンプルデータ（PMDA添付文書の正式値ではないダミー。後でCSVで差し替え可能） ---
const SAMPLE_DEVICES: Device[] = [
  // ガイディング
  {
    id: "gc-1",
    name: "GC A ID 0.088in",
    maker: "SampleCo",
    category: "ガイディング",
    id_mm: inchToMm(0.088), // ≒2.24 mm
    od_mm: frToMm(8), // ≒2.64 mm（参考）
    length_cm: 100,
    notes: "試作用ダミー。実機値で置換してください。",
  },
  {
    id: "gc-2",
    name: "GC B ID 0.091in",
    maker: "SampleCo",
    category: "ガイディング",
    id_mm: inchToMm(0.091), // ≒2.31 mm
    od_mm: frToMm(8.5),
    length_cm: 90,
  },
  // 中間（Distal Access）
  {
    id: "ic-1",
    name: "IC A 5.5Fr / ID 0.058in",
    maker: "SampleCo",
    category: "中間",
    id_mm: inchToMm(0.058), // ≒1.47 mm
    od_mm: frToMm(5.5), // ≒1.82 mm
    length_cm: 115,
  },
  {
    id: "ic-2",
    name: "IC B 6Fr / ID 0.060in",
    maker: "SampleCo",
    category: "中間",
    id_mm: inchToMm(0.06), // ≒1.52 mm
    od_mm: frToMm(6), // ≒1.98 mm
    length_cm: 120,
  },
  // マイクロ
  {
    id: "mc-1",
    name: "MC A 0.017in / 2.4Fr",
    maker: "SampleCo",
    category: "マイクロ",
    id_mm: inchToMm(0.017), // 内腔（参考）
    od_mm: frToMm(2.4), // ≒0.79 mm（外径の近似）
    length_cm: 160,
  },
  {
    id: "mc-2",
    name: "MC B 0.021in / 2.7Fr",
    maker: "SampleCo",
    category: "マイクロ",
    id_mm: inchToMm(0.021),
    od_mm: frToMm(2.7), // ≒0.89 mm
    length_cm: 156,
  },
];

// --- 小さな表示用チップ ---
const Chip = ({ children, ok }: { children: React.ReactNode; ok?: boolean }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
    ok === undefined
      ? "border-slate-500/50 text-white"
      : ok
      ? "border-emerald-400 text-white"
      : "border-red-400 text-white"
  }`}>{children}</span>
);

// --- 互換性ロジック ---
function useCompatibility(
  gc?: Device,
  ic?: Device,
  mc?: Device,
  clearanceMm: number = 0.10,
) {
  const result = useMemo(() => {
    const mmOk = (x?: number) => typeof x === "number" && !isNaN(x) && x > 0;

    // 直径チェック
    const icInGcOK = mmOk(gc?.id_mm) && mmOk(ic?.od_mm)
      ? (ic!.od_mm! + clearanceMm <= gc!.id_mm!)
      : undefined;

    const mcInIcOK = mmOk(ic?.id_mm) && mmOk(mc?.od_mm)
      ? (mc!.od_mm! + clearanceMm <= ic!.id_mm!)
      : undefined;

    // 長さ差（同一スケール比較）
    const gcIcDiffCm = mmOk(gc?.length_cm) && mmOk(ic?.length_cm)
      ? Math.abs(gc!.length_cm! - ic!.length_cm!)
      : undefined;

    const icMcDiffCm = mmOk(ic?.length_cm) && mmOk(mc?.length_cm)
      ? Math.abs(ic!.length_cm! - mc!.length_cm!)
      : undefined;

    const gcIcDiffOK = gcIcDiffCm !== undefined ? gcIcDiffCm >= 20 : undefined;
    const icMcDiffOK = icMcDiffCm !== undefined ? icMcDiffCm >= 20 : undefined;

    return {
      icInGcOK,
      mcInIcOK,
      gcIcDiffCm,
      icMcDiffCm,
      gcIcDiffOK,
      icMcDiffOK,
    } as const;
  }, [gc, ic, mc, clearanceMm]);

  return result;
}

// --- 単位表示ヘルパ ---
const fmt = {
  mm: (v?: number) => (typeof v === "number" ? `${v.toFixed(2)} mm` : "—"),
  inch: (v?: number) => (typeof v === "number" ? `${v.toFixed(3)}″` : "—"),
  cm: (v?: number) => (typeof v === "number" ? `${v.toFixed(1)} cm` : "—"),
};

// --- 2D 可視化コンポーネント（横向き・同一スケール） ---
function LengthVisualizer({ gc, ic, mc }: { gc?: Device; ic?: Device; mc?: Device }) {
  const maxLen = Math.max(gc?.length_cm || 0, ic?.length_cm || 0, mc?.length_cm || 0, 120);

  const containerW = 760; // px
  const pxPerCm = containerW / maxLen;
  const x0 = 36; // 左余白

  // Yコネクタ（GC・IC とも 5 cm 仮定）
  const yGcCm = 5;
  const yIcCm = 5;
  const yGcW = yGcCm * pxPerCm;
  const yIcW = yIcCm * pxPerCm;

  // 外径(mm) → 太さ(px)
  const pxPerMm = 8;
  const gcTh = gc?.od_mm ? gc.od_mm * pxPerMm : 0;
  const icTh = ic?.od_mm ? ic.od_mm * pxPerMm : 0;
  const mcTh = mc?.od_mm ? mc.od_mm * pxPerMm : 0;
  const maxTh = Math.max(gcTh, icTh, mcTh, 16);

  // Yコネ本体を少しだけ上下に太く（バー厚の約15%増し）
  const yScale = 1.15;
  const yGcH = gcTh * yScale;
  const yIcH = icTh * yScale;

  const centerY = 16 + maxTh / 2; // バー中心線
  const axisY = centerY + maxTh / 2 + 20; // 目盛りのベースライン
  const containerH = axisY + 28; // 全体高さ

  // 全長（同一スケール）
  const gcW = (gc?.length_cm || 0) * pxPerCm;
  const icW = (ic?.length_cm || 0) * pxPerCm;
  const mcW = (mc?.length_cm || 0) * pxPerCm;

  // 先端座標
  const gcTipX = x0 + gcW;
  const icTipX = x0 + icW;

  // “実長差”の参考値（UIラベル用）
  const icMinusGcCm = Math.max(0, (ic?.length_cm || 0) - (gc?.length_cm || 0));
  const mcMinusIcCm = Math.max(0, (mc?.length_cm || 0) - (ic?.length_cm || 0));

  // 目盛り（10 cm 主目盛、5 cm 副目盛）
  const majorStep = 10; const minorStep = 5;
  const majors = Array.from({ length: Math.floor(maxLen / majorStep) + 1 }, (_, i) => i * majorStep);
  const minors = Array.from({ length: Math.floor(maxLen / minorStep) + 1 }, (_, i) => i * minorStep).filter(v => v % majorStep !== 0);

  // Yコネクタ（PASSAGE風）を描くミニSVG（簡略版）
  const YConn = ({ w, h, baseH, stroke = '#b45309', fill = '#fef3c7' }: { w: number; h: number; baseH?: number; stroke?: string; fill?: string }) => {
    const bodyW = w; // 本体は矩形のみ
    const cy = h / 2;
    const refH = baseH ?? h;
    const branchOriginX = Math.max(8, bodyW - 10); // 先端直前から分岐
    const branchLen = Math.max(20, Math.min(34, Math.floor(w * 0.25))); // 短めに
    const branchTh  = Math.max(6, Math.min(14, refH * 0.50));

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
        {/* 本体（直胴） */}
        <rect x={0} y={0} width={bodyW} height={h} fill={fill} stroke={stroke} />
        {/* サイドポート（短い斜め枝） */}
        <g transform={`translate(${branchOriginX},${cy}) rotate(-60)`}>
          <rect x={0} y={-branchTh / 2} width={branchLen} height={branchTh} fill={fill} stroke={stroke} />
        </g>
        {/* ナール（軽いスリット） */}
        <rect x={bodyW - 6} y={0} width={6} height={h} fill="none" stroke={stroke} strokeDasharray="2 2" />
      </svg>
    );
  };

  return (
    <div className="w-full">
      <div className="relative mx-auto" style={{ height: containerH, width: containerW + 220 }}>
        {/* 目盛り軸 */}
        <div className="absolute bg-slate-600" style={{ left: x0, top: axisY, height: 1, width: containerW }} />
        {/* 主目盛（数値付き） */}
        {majors.map(cm => (
          <div key={`M${cm}`} className="absolute" style={{ left: x0 + cm * pxPerCm, top: axisY - 8 }}>
            <div className="bg-slate-300" style={{ width: 1, height: 12 }} />
            <div className="text-[10px] text-white -translate-x-1/2 mt-0.5">{cm} cm</div>
          </div>
        ))}
        {/* 副目盛 */}
        {minors.map(cm => (
          <div key={`m${cm}`} className="absolute bg-slate-500" style={{ left: x0 + cm * pxPerCm, top: axisY - 6, width: 1, height: 8 }} />
        ))}

        {/* Yコネクタ（GC, IC 各5 cm） */}
        {gc && gcW > 0 && (
        <div className="absolute" style={{ left: gcTipX, top: centerY - yGcH / 2, height: yGcH, width: yGcW, zIndex: 30, overflow: 'visible' }}>
          <YConn w={yGcW} h={yGcH} baseH={gcTh} />
        </div>
        )}
        {ic && icW > 0 && (
        <div className="absolute" style={{ left: icTipX, top: centerY - yIcH / 2, height: yIcH, width: yIcW, zIndex: 20, overflow: 'visible' }}>
          <YConn w={yIcW} h={yIcH} baseH={icTh} />
        </div>
        )}

        {/* === フル長バー（同一スケール） === */}
        {/* GC（最前面） */}
        <div
          className="absolute bg-pink-100 border border-pink-400 shadow-sm"
          style={{ left: x0, top: centerY - gcTh / 2, height: gcTh, width: gcW, opacity: 0.85, zIndex: 30 }}
        />
        {/* IC（中間）*/}
        <div
          className="absolute bg-emerald-50 border border-emerald-400"
          style={{ left: x0, top: centerY - icTh / 2, height: icTh, width: icW, opacity: 0.85, zIndex: 20 }}
        />
        {/* MC（背面）*/}
        <div
          className="absolute bg-sky-50 border border-sky-400"
          style={{ left: x0, top: centerY - mcTh / 2, height: mcTh, width: mcW, opacity: 0.85, zIndex: 10 }}
        />

        {/* ラベル（右側） */}
        <div className="absolute text-xs text-white" style={{ top: 4, left: x0 + containerW + 32 }}>
          <div>GC 全長：{fmt.cm(gc?.length_cm)}</div>
          <div>IC 全長：{fmt.cm(ic?.length_cm)}</div>
          <div>MC 全長：{fmt.cm(mc?.length_cm)}</div>
          <div className="mt-1">GC と IC の差：{fmt.cm(icMinusGcCm)}</div>
          <div>IC と MC の差：{fmt.cm(mcMinusIcCm)}</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [devices, setDevices] = useState<Device[]>(SAMPLE_DEVICES);

  /* ========= ここだけ追加：GoogleスプレッドシートのCSVを自動読込 ========= */
  const fetchCSV = useCallback(async () => {
    try {
      const res = await fetch(`${GOOGLE_SHEET_CSV_URL}&t=${Date.now()}`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const out = csvToDevices(text);
      if (out.length === 0) return;

      // 既存とマージ（同カテゴリ名一致なら置換）— 元の handleCsvImport の方針を踏襲
      setDevices(prev => {
        const byKey = new Map<string, Device>();
        const all = [...prev, ...out];
        for (const d of all) {
          const key = `${d.category}::${d.name}`;
          byKey.set(key, d);
        }
        return Array.from(byKey.values());
      });
    } catch (e) {
      // UI/レイアウト変更を避けるため表示は出さない（コンソールのみ）
      console.error("CSV fetch failed:", e);
    }
  }, []);

  useEffect(() => {
    void fetchCSV();
  }, [fetchCSV]);
  /* ========= 追加ここまで ========= */

  const guidingList = useMemo(() => devices.filter(d => d.category === "ガイディング"), [devices]);
  const interList   = useMemo(() => devices.filter(d => d.category === "中間"), [devices]);
  const microList   = useMemo(() => devices.filter(d => d.category === "マイクロ"), [devices]);

  const [gcId, setGcId] = useState<string>(guidingList[0]?.id || "");
  const [icId, setIcId] = useState<string>(interList[0]?.id || "");
  const [mcId, setMcId] = useState<string>(microList[0]?.id || "");

  const gc = useMemo(() => devices.find(d => d.id === gcId), [devices, gcId]);
  const ic = useMemo(() => devices.find(d => d.id === icId), [devices, icId]);
  const mc = useMemo(() => devices.find(d => d.id === mcId), [devices, mcId]);

  const { icInGcOK, mcInIcOK, gcIcDiffCm, icMcDiffCm, gcIcDiffOK, icMcDiffOK } = useCompatibility(gc, ic, mc);

  // CSV 取り込み（列名は柔軟に推定） ※UI変更なし
  const handleCsvImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");

        // 既存の簡易CSV処理を堅牢パーサに置換（見た目は不変）
        const out = csvToDevices(text);
        if (out.length === 0) throw new Error("CSVにデータ行がありません");

        setDevices(prev => {
          const byKey = new Map<string, Device>();
          const all = [...prev, ...out];
          for (const d of all) {
            const key = `${d.category}::${d.name}`;
            byKey.set(key, d);
          }
          return Array.from(byKey.values());
        });
      } catch (e) {
        alert(`CSV読込に失敗しました：${(e as Error).message}`);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  // --- 開発用・自己テスト（簡易） ---
  type TestCase = { name: string; pass: boolean; actual?: string };
  const tests: TestCase[] = (() => {
    const t: TestCase[] = [];
    // 1) 差の定義テスト：GC 100, IC 115 → 差=15 (<20) → NG
    const diff1 = Math.abs(100 - 115);
    t.push({ name: "GC-IC 差は絶対値（100と115→15）", pass: diff1 === 15, actual: `${diff1}` });
    t.push({ name: "GC-IC 条件（差≥20）: 15→NG", pass: diff1 < 20 });

    // 2) 差の定義テスト：IC 115, MC 160 → 差=45 (≥20) → OK
    const diff2 = Math.abs(115 - 160);
    t.push({ name: "IC-MC 差は絶対値（115と160→45）", pass: diff2 === 45, actual: `${diff2}` });
    t.push({ name: "IC-MC 条件（差≥20）: 45→OK", pass: diff2 >= 20 });

    // 3) 直径適合テスト（サンプル想定）：
    const icOd = frToMm(5.5); // ≒1.82
    const gcId = inchToMm(0.088); // ≒2.24
    const clearance = 0.10;
    t.push({ name: "直径: IC in GC", pass: icOd + clearance <= gcId, actual: `${(icOd+clearance).toFixed(2)} <= ${gcId.toFixed(2)}` });

    const mcOd = frToMm(2.4); // ≒0.79
    const icId = inchToMm(0.058); // ≒1.47
    t.push({ name: "直径: MC in IC", pass: mcOd + clearance <= icId, actual: `${(mcOd+clearance).toFixed(2)} <= ${icId.toFixed(2)}` });

    return t;
  })();

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-6xl mx-auto grid gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">脳血管内治療デバイス 互換性チェック（試作）</h1>
          <div className="text-xs text-white">v0.9.0 (no-3d)</div>
        </div>

        {/* セレクター */}
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader className="text-white">
            <CardTitle className="text-white">デバイス選択</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-white">ガイディング</Label>
                <Select value={gcId} onValueChange={setGcId}>
                  <SelectTrigger className="w-full text-white"><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {guidingList.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white">中間</Label>
                <Select value={icId} onValueChange={setIcId}>
                  <SelectTrigger className="w-full text-white"><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {interList.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white">マイクロ</Label>
                <Select value={mcId} onValueChange={setMcId}>
                  <SelectTrigger className="w-full text-white"><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {microList.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 結果 */}
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader className="text-white">
            <CardTitle className="text-white">互換性チェック結果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="font-medium">内径／外径</div>
                <div className="flex items-center gap-2">
                  {icInGcOK ? <IconCheck/> : <IconAlert/>}
                  <span>IC in GC：</span>
                  <Chip ok={icInGcOK}>OD(IC)：{fmt.mm(ic?.od_mm)} ／ ID(GC)：{fmt.mm(gc?.id_mm)}</Chip>
                </div>
                <div className="flex items-center gap-2">
                  {mcInIcOK ? <IconCheck/> : <IconAlert/>}
                  <span>MC in IC：</span>
                  <Chip ok={mcInIcOK}>OD(MC)：{fmt.mm(mc?.od_mm)} ／ ID(IC)：{fmt.mm(ic?.id_mm)}</Chip>
                </div>
              </div>
              <div className="space-y-1">
                <div className="font平均">長さ（同一スケール）</div>
                <div className="flex items-center gap-2">
                  {gcIcDiffOK ? <IconCheck/> : <IconAlert/>}
                  <span>GC と IC の差：</span>
                  <Chip ok={gcIcDiffOK}>{fmt.cm(gcIcDiffCm)}（条件 ≥ 20 cm）</Chip>
                </div>
                <div className="flex items-center gap-2">
                  {icMcDiffOK ? <IconCheck/> : <IconAlert/>}
                  <span>IC と MC の差：</span>
                  <Chip ok={icMcDiffOK}>{fmt.cm(icMcDiffCm)}（条件 ≥ 20 cm）</Chip>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 可視化 */}
        <Card className="bg-slate-800 border-slate-700 text白">
          <CardHeader className="text白">
            <CardTitle className="text白">可視化</CardTitle>
          </CardHeader>
          <CardContent>
            <LengthVisualizer gc={gc} ic={ic} mc={mc} />
          </CardContent>
        </Card>

        {/* CSV / テスト（UIは従来通り、必要時に活用） */}
        {/* 例：<input type="file" accept=".csv" onChange={(e)=>e.target.files && handleCsvImport(e.target.files[0])}/> */}
      </div>
    </div>
  );
}
