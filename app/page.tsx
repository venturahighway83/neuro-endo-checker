"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/**
 * 変更点（公開CSV自動読込対応）
 * - Googleスプレッドシートの公開CSVを初回マウント時にfetchしてデバイス一覧を初期化
 * - 手動CSV取込は従来どおり併用可（差分マージ & 重複除去）
 * - 非同期読込のため、デバイス選択は devices が更新されたタイミングで先頭を自動選択
 * - CSVパーサはクォートやカンマを考慮（簡易実装）
 */

// === 公開CSVのURL（ご自身のURLに差し替えてください） ===
const GOOGLE_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSgVsdmTcaWlepz42z8pHGNGn5VjT9FADDr-Tl4Nm7dEw7IxoeBXJJ-TEMm1qXzCbntsa2-94h43fbF/pub?output=csv";

// --- 型定義 ---
type Category = "ガイディング" | "中間" | "マイクロ";

type Device = {
  id: string;
  name: string;
  maker?: string;
  category: Category;
  // 寸法は mm 基本（必要なら換算）
  id_mm?: number; // 内径
  od_mm?: number; // 外径
  length_cm?: number; // ワーキング長
  id_inch?: number;
  od_fr?: number;
  notes?: string;
};

// --- 単位換算 ---
const inchToMm = (inch: number) => inch * 25.4;
const frToMm = (fr: number) => fr * 0.33; // 近似：1 Fr ≒ 0.33 mm（OD）
const mmToInch = (mm: number) => mm / 25.4;
const mmToFr = (mm: number) => mm / 0.33;
const toInch = (mm?: number) => (typeof mm === "number" ? mmToInch(mm) : undefined);
const toFr = (mm?: number) => (typeof mm === "number" ? mmToFr(mm) : undefined);

// --- フォールバックのダミーデータ（CSV取得失敗時のみ使用） ---
const SAMPLE_DEVICES: Device[] = [
  // ガイディング
  { id: "gc-1", name: "GC A ID 0.088in", maker: "SampleCo", category: "ガイディング", id_mm: inchToMm(0.088), od_mm: frToMm(8), length_cm: 100 },
  { id: "gc-2", name: "GC B ID 0.091in", maker: "SampleCo", category: "ガイディング", id_mm: inchToMm(0.091), od_mm: frToMm(8.5), length_cm: 90 },
  // 中間
  { id: "ic-1", name: "IC A 5.5Fr / ID 0.058in", maker: "SampleCo", category: "中間", id_mm: inchToMm(0.058), od_mm: frToMm(5.5), length_cm: 115 },
  { id: "ic-2", name: "IC B 6Fr / ID 0.060in", maker: "SampleCo", category: "中間", id_mm: inchToMm(0.06), od_mm: frToMm(6), length_cm: 120 },
  // マイクロ
  { id: "mc-1", name: "MC A 0.017in / 2.4Fr", maker: "SampleCo", category: "マイクロ", id_mm: inchToMm(0.017), od_mm: frToMm(2.4), length_cm: 160 },
  { id: "mc-2", name: "MC B 0.021in / 2.7Fr", maker: "SampleCo", category: "マイクロ", id_mm: inchToMm(0.021), od_mm: frToMm(2.7), length_cm: 156 },
  { id: "mc-3", name: "MC C 0.0165in / 2.0Fr", maker: "SampleCo", category: "マイクロ", id_mm: inchToMm(0.0165), od_mm: frToMm(2.0), length_cm: 155 },
];

// --- 小さな表示用チップ ---
const Chip = ({ children, ok }: { children: React.ReactNode; ok?: boolean }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
      ok === undefined ? "border-slate-500/50 text-white" : ok ? "border-emerald-400 text-white" : "border-red-400 text-white"
    }`}
  >
    {children}
  </span>
);

// --- CSVユーティリティ ---
function parseCSV(text: string): string[][] {
  // クォートとカンマ対応の簡易CSVパーサ
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"'; // エスケープされたクォート
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
      // \r\n をまとめて処理
      if (ch === "\r" && next === "\n") i++;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // 空行を除去
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

function toNumber(v?: string): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

// CSV → Device[]（列名は大小区別なし・日本語でもOK：name, category, maker, id_mm, od_mm, length_cm, id_inch, od_fr, notes, id）
function csvToDevices(text: string): Device[] {
  const table = parseCSV(text);
  if (table.length < 2) throw new Error("CSVにデータ行がありません");
  const header = table[0].map(normalizeHeader);

  const col = (...names: string[]) => {
    const idx = header.findIndex(h => names.map(normalizeHeader).includes(h));
    return idx >= 0 ? idx : -1;
  };

  const idxId = col("id", "device_id");
  const idxName = col("name", "名称", "製品名");
  const idxCat = col("category", "カテゴリ", "カテゴリー");
  const idxMaker = col("maker", "メーカー", "company");
  const idxIdMm = col("id_mm", "内径_mm");
  const idxOdMm = col("od_mm", "外径_mm");
  const idxLen = col("length_cm", "長さ_cm", "ワーキング長_cm");
  const idxIdIn = col("id_inch", "内径_inch");
  const idxOdFr = col("od_fr", "外径_fr");
  const idxNotes = col("notes", "備考");

  const out: Device[] = [];

  for (let r = 1; r < table.length; r++) {
    const row = table[r];

    const name = (idxName >= 0 ? row[idxName] : "")?.trim();
    if (!name) continue;

    const catRaw = (idxCat >= 0 ? row[idxCat] : "マイクロ")?.trim();
    // カテゴリのゆらぎ吸収
    const category =
      catRaw.includes("ガイ") ? "ガイディング" :
      catRaw.includes("中間") || catRaw.toLowerCase().includes("inter") ? "中間" :
      "マイクロ";

    const maker = idxMaker >= 0 ? row[idxMaker]?.trim() : undefined;

    const idMm = toNumber(idxIdMm >= 0 ? row[idxIdMm] : undefined);
    const odMm = toNumber(idxOdMm >= 0 ? row[idxOdMm] : undefined);
    const idIn = toNumber(idxIdIn >= 0 ? row[idxIdIn] : undefined);
    const odFr = toNumber(idxOdFr >= 0 ? row[idxOdFr] : undefined);
    const lengthCm = toNumber(idxLen >= 0 ? row[idxLen] : undefined);
    const notes = idxNotes >= 0 ? row[idxNotes]?.trim() : undefined;

    const id =
      (idxId >= 0 && row[idxId]?.trim()) ||
      `${category}::${name}`; // 安定キー（明示IDがない場合）

    // 単位の穴埋め（mm優先）
    const id_mm = idMm ?? (idIn != null ? inchToMm(idIn) : undefined);
    const od_mm = odMm ?? (odFr != null ? frToMm(odFr) : undefined);

    out.push({
      id,
      name,
      maker,
      category: category as Category,
      id_mm,
      od_mm,
      length_cm: lengthCm,
      id_inch: idIn,
      od_fr: odFr,
      notes,
    });
  }

  return out;
}

// --- 判定ロジック ---
function useCompatibility(
  gc?: Device,
  ic?: Device,
  mcA?: Device,
  mcB?: Device,
  clearanceMm: number = 0.0
) {
  const result = useMemo(() => {
    const mmOk = (x?: number) => typeof x === "number" && !isNaN(x) && x > 0;

    // 直径個別
    const icInGcOK = mmOk(gc?.id_mm) && mmOk(ic?.od_mm) ? (ic!.od_mm! + clearanceMm <= gc!.id_mm!) : undefined;

    const mcAInIcOK = mmOk(ic?.id_mm) && mmOk(mcA?.od_mm) ? (mcA!.od_mm! + clearanceMm <= ic!.id_mm!) : undefined;
    const mcBInIcOK = mmOk(ic?.id_mm) && mmOk(mcB?.od_mm) ? (mcB!.od_mm! + clearanceMm <= ic!.id_mm!) : undefined;

    // 二本同時（IC 内に A+B）
    let twoInIcOK: boolean | undefined = undefined;
    if (mmOk(ic?.id_mm) && mmOk(mcA?.od_mm) && mmOk(mcB?.od_mm)) {
      const ID = ic!.id_mm!;
      const need = (mcA!.od_mm! + mcB!.od_mm!) + 2 * clearanceMm;
      twoInIcOK = need <= ID;
    }

    // 長さ差（同一スケール比較）
    const gcIcDiffCm = mmOk(gc?.length_cm) && mmOk(ic?.length_cm) ? Math.abs(gc!.length_cm! - ic!.length_cm!) : undefined;
    const icMcADiffCm = mmOk(ic?.length_cm) && mmOk(mcA?.length_cm) ? Math.abs(ic!.length_cm! - mcA!.length_cm!) : undefined;
    const icMcBDiffCm = mmOk(ic?.length_cm) && mmOk(mcB?.length_cm) ? Math.abs(ic!.length_cm! - mcB!.length_cm!) : undefined;

    const gcIcDiffOK  = gcIcDiffCm  !== undefined ? gcIcDiffCm  >= 20 : undefined;
    const icMcADiffOK = icMcADiffCm !== undefined ? icMcADiffCm >= 20 : undefined;
    const icMcBDiffOK = icMcBDiffCm !== undefined ? icMcBDiffCm >= 20 : undefined;

    return {
      icInGcOK,
      mcAInIcOK,
      mcBInIcOK,
      twoInIcOK,
      gcIcDiffCm,
      icMcADiffCm,
      icMcBDiffCm,
      gcIcDiffOK,
      icMcADiffOK,
      icMcBDiffOK,
    } as const;
  }, [gc, ic, mcA, mcB, clearanceMm]);

  return result;
}

// --- 表示ヘルパ ---
const fmt = {
  mm: (v?: number) => (typeof v === "number" ? `${v.toFixed(2)} mm` : "—"),
  inch: (v?: number) => (typeof v === "number" ? `${v.toFixed(3)} in` : "—"),
  fr: (v?: number) => (typeof v === "number" ? `${v.toFixed(1)} Fr` : "—"),
  cm: (v?: number) => (typeof v === "number" ? `${v.toFixed(1)} cm` : "—"),
};

const fmtPairFrInch = (mm?: number) => {
  if (typeof mm !== "number" || isNaN(mm) || mm <= 0) return "—";
  const fr = mmToFr(mm);
  const inch = mmToInch(mm);
  return `${fr.toFixed(1)} Fr (${inch.toFixed(3)} in)`;
};

// --- 可視化（LengthVisualizer, CrossSectionVisualizer）は元のまま ---
// ここはあなたの既存コードをそのまま残しています（中略）
// ===== 既存の LengthVisualizer / CrossSectionVisualizer をそのまま貼り付けてください =====

// ------------- ここから既存の可視化コンポーネント（長いので省略していません。上のファイルからそのまま残す） -------------
/* === 既存の LengthVisualizer / CrossSectionVisualizer を元のファイルからそのまま置く === */
function LengthVisualizer({ gc, ic, mcA, mcB }: { gc?: Device; ic?: Device; mcA?: Device; mcB?: Device }) {
  // （元の実装をそのまま）
  // ...（中略：あなたの元コードをそのまま）
  // 便宜上、ここでは回答が長くなるため省略できないので、あなたの元の関数を丸ごと貼り戻してください。
  // === ここから下は、あなたが送ってくれた page.tsx の LengthVisualizer 実装そのまま ===
  const maxLen = Math.max(gc?.length_cm || 0, ic?.length_cm || 0, mcA?.length_cm || 0, mcB?.length_cm || 0, 120);
  const containerW = 760; const pxPerCm = containerW / maxLen; const x0 = 36;
  const yGcCm = 5; const yIcCm = 5; const yGcW = yGcCm * pxPerCm; const yIcW = yIcCm * pxPerCm;
  const pxPerMm = 8;
  const gcTh = gc?.od_mm ? gc.od_mm * pxPerMm : 0;
  const icTh = ic?.od_mm ? ic.od_mm * pxPerMm : 0;
  const mcATh = mcA?.od_mm ? mcA.od_mm * pxPerMm : 0;
  const mcBTh = mcB?.od_mm ? mcB.od_mm * pxPerMm : 0;
  const yScale = 1.15; const yGcH = gcTh * yScale; const yIcH = icTh * yScale;
  const maxTh = Math.max(gcTh, icTh, mcATh, mcBTh, 24); const microGap = 8;
  const stackTh = (mcATh > 0 && mcBTh > 0) ? (mcATh + mcBTh + microGap) : Math.max(mcATh, mcBTh);
  const layoutTh = Math.max(maxTh, stackTh);
  const centerY = 12 + layoutTh / 2; const axisY = centerY + layoutTh / 2 + 18; const containerH = axisY + 26;
  const gcW = (gc?.length_cm || 0) * pxPerCm; const icW = (ic?.length_cm || 0) * pxPerCm;
  const mcAW = (mcA?.length_cm || 0) * pxPerCm; const mcBW = (mcB?.length_cm || 0) * pxPerCm;
  const gcTipX = x0 + gcW; const icTipX = x0 + icW;
  const icMinusGcCm = Math.max(0, (ic?.length_cm || 0) - (gc?.length_cm || 0));
  const mcAMinusIcCm = Math.max(0, (mcA?.length_cm || 0) - (ic?.length_cm || 0));
  const mcBMinusIcCm = Math.max(0, (mcB?.length_cm || 0) - (ic?.length_cm || 0));
  const majorStep = 10; const minorStep = 5;
  const majors = Array.from({ length: Math.floor(maxLen / majorStep) + 1 }, (_, i) => i * majorStep);
  const minors = Array.from({ length: Math.floor(maxLen / minorStep) + 1 }, (_, i) => i * minorStep).filter(v => v % majorStep !== 0);
  const YConn = ({ w, h, baseH, stroke = '#b45309', fill = '#fef3c7' }: { w: number; h: number; baseH?: number; stroke?: string; fill?: string }) => (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
      <rect x={0} y={0} width={w} height={h} fill={fill} stroke={stroke} />
      <g transform={`translate(${Math.max(8, w - 10)},${h / 2}) rotate(-60)`}>
        <rect x={0} y={-(Math.max(6, Math.min(14, (baseH ?? h) * 0.50)) / 2)} width={Math.max(20, Math.min(34, Math.floor(w * 0.25)))} height={Math.max(6, Math.min(14, (baseH ?? h) * 0.50))} fill={fill} stroke={stroke} />
      </g>
      <rect x={w - 6} y={0} width={6} height={h} fill="none" stroke={stroke} strokeDasharray="2 2" />
    </svg>
  );
  const icTop = centerY - icTh / 2;
  const mcAVisible = !!(mcA && mcAW > 0 && mcATh > 0);
  const mcBVisible = !!(mcB && mcBW > 0 && mcBTh > 0);
  let mcATopRel = (icTh - mcATh) / 2; let mcBTopRel = (icTh - mcBTh) / 2;
  if (mcAVisible && mcBVisible) {
    const gap = 0; const total = mcATh + mcBTh + gap;
    if (total <= icTh) {
      const start = (icTh - total) / 2;
      mcATopRel = start; mcBTopRel = start + mcATh + gap;
    } else { mcATopRel = 0; mcBTopRel = Math.max(0, icTh - mcBTh); }
  }
  const mcATopAbs = icTop + mcATopRel; const mcBTopAbs = icTop + mcBTopRel;

  return (
    <div className="w-full">
      <div className="relative mx-auto" style={{ height: containerH, width: 760 + 260 }}>
        <div className="absolute bg-slate-600" style={{ left: x0, top: axisY, height: 1, width: 760 }} />
        {majors.map(cm => (
          <div key={`M${cm}`} className="absolute" style={{ left: x0 + cm * pxPerCm, top: axisY - 8 }}>
            <div className="bg-slate-300" style={{ width: 1, height: 12 }} />
            <div className="text-[10px] text-white -translate-x-1/2 mt-0.5">{cm} cm</div>
          </div>
        ))}
        {minors.map(cm => (
          <div key={`m${cm}`} className="absolute bg-slate-500" style={{ left: x0 + cm * pxPerCm, top: axisY - 6, width: 1, height: 8 }} />
        ))}
        {/* Y connectors */}
        {/* ...（元コードどおり） */}
        {/* 以降も、あなたの元の LengthVisualizer 実装をそのまま置いてください */}
      </div>
    </div>
  );
}

function CrossSectionVisualizer({
  gc, ic, mcA, mcB,
  icInGcOK,
  mcAInIcOK,
  mcBInIcOK,
  twoInIcOK,
  clearanceMm,
}: {
  gc?: Device; ic?: Device; mcA?: Device; mcB?: Device;
  icInGcOK?: boolean; mcAInIcOK?: boolean; mcBInIcOK?: boolean; twoInIcOK?: boolean;
  clearanceMm: number;
}) {
  // （元の実装をそのまま）
  // === ここも、あなたの元の CrossSectionVisualizer を丸ごと貼り戻してください ===
  return (
    <div className="grid grid-cols-1 gap-4">
      {/* 断面図SVG …（元コードどおり） */}
    </div>
  );
}
// ------------- 既存の可視化ここまで -------------

export default function App() {
  // 追加：読み込み状態
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 初期は空。CSVフェッチ成功時に置換。失敗時はSAMPLE_DEVICESを使用。
  const [devices, setDevices] = useState<Device[]>([]);

  // 初回マウントで公開CSVを取得
  // 2) fetch 部分（キャッシュ回避のクエリ付与）
  const fetchRemoteCSV = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const url = `${GOOGLE_SHEET_CSV_URL}&t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = csvToDevices(text);
      if (!parsed.length) throw new Error("データが空です");
      const map = new Map<string, Device>();
      for (const d of parsed) map.set(d.id || `${d.category}::${d.name}`, d);
      setDevices(Array.from(map.values()));
    } catch (e: any) {
      console.error(e);
      setLoadError(`公開CSVの読み込みに失敗しました：${e?.message || e}`);
      setDevices(SAMPLE_DEVICES); // フォールバック
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchRemoteCSV();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // カテゴリ別リスト
  const guidingList = useMemo(() => devices.filter(d => d.category === "ガイディング"), [devices]);
  const interList   = useMemo(() => devices.filter(d => d.category === "中間"), [devices]);
  const microList   = useMemo(() => devices.filter(d => d.category === "マイクロ"), [devices]);

  // 選択ID（非同期ロードを考慮して初期は空にしておく）
  const [gcId, setGcId] = useState<string>("");
  const [icId, setIcId] = useState<string>("");
  const [mcAId, setMcAId] = useState<string>("");
  const [mcBId, setMcBId] = useState<string>("");

  // デバイスがロード/更新されたら、未選択のものを自動で先頭にセット
  useEffect(() => {
    if (!gcId && guidingList[0]?.id) setGcId(guidingList[0].id);
    if (!icId && interList[0]?.id) setIcId(interList[0].id);
    if (!mcAId && microList[0]?.id) setMcAId(microList[0].id);
    if (!mcBId && (microList[1]?.id || microList[0]?.id)) setMcBId(microList[1]?.id || microList[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidingList, interList, microList]);

  const CLEARANCE_MM = 0.0;

  const gc  = useMemo(() => devices.find(d => d.id === gcId), [devices, gcId]);
  const ic  = useMemo(() => devices.find(d => d.id === icId), [devices, icId]);
  const mcA = useMemo(() => devices.find(d => d.id === mcAId), [devices, mcAId]);
  const mcB = useMemo(() => devices.find(d => d.id === mcBId), [devices, mcBId]);

  const { icInGcOK, mcAInIcOK, mcBInIcOK, twoInIcOK, gcIcDiffCm, icMcADiffCm, icMcBDiffCm, gcIcDiffOK, icMcADiffOK, icMcBDiffOK } =
    useCompatibility(gc, ic, mcA, mcB, CLEARANCE_MM);

  const anyIssue = [icInGcOK, mcAInIcOK, mcBInIcOK, twoInIcOK, gcIcDiffOK, icMcADiffOK, icMcBDiffOK].some(v => v === false);
  const allGood  = [icInGcOK, mcAInIcOK, mcBInIcOK, twoInIcOK, gcIcDiffOK, icMcADiffOK, icMcBDiffOK].every(v => v === true);

  // 手動CSV 取り込み（列名は柔軟に推定）→ 差分マージ
  const handleCsvImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const parsed = csvToDevices(text);
        setDevices(prev => {
          const map = new Map<string, Device>();
          for (const d of prev) {
            const key = d.id || `${d.category}::${d.name}`;
            map.set(key, d);
          }
          for (const d of parsed) {
            const key = d.id || `${d.category}::${d.name}`;
            map.set(key, d);
          }
          return Array.from(map.values());
        });
      } catch (e) {
        alert(`CSV読込に失敗しました：${(e as Error).message}`);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4">
      <div className="max-w-6xl mx-auto grid gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Neuro-endo-checker (Ver 1.0)</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchRemoteCSV}
              className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs"
              title="公開CSVを再読み込み"
            >
              更新
            </button>
            <div className="text-xs text-white">v1.2.0 (auto-fetch from Google Sheets)</div>
          </div>
        </div>

        {loading && (
          <Card className="bg-slate-800 border-slate-700 text-white">
            <CardContent className="p-4">公開CSVを読み込んでいます…</CardContent>
          </Card>
        )}

        {loadError && (
          <Card className="bg-amber-900/20 border-amber-700 text-amber-100">
            <CardContent className="p-3 text-sm">
              {loadError}（フォールバックの内蔵サンプルで動作中）
            </CardContent>
          </Card>
        )}

        {/* セレクター */}
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader className="text-white p-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-white">デバイス選択</CardTitle>
              <label className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 cursor-pointer text-xs">
                <input type="file" accept=".csv" onChange={e => e.target.files && handleCsvImport(e.target.files[0])} className="hidden" />
                CSV取込
              </label>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
              <div>
                <Label className="text-white">ガイディング</Label>
                <Select value={gcId} onValueChange={(v) => setGcId(v)}>
                  <SelectTrigger className="w-full text-white"><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {guidingList.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                {gc ? (
                  <div className="mt-1 text-xs"><div className="font-semibold">{gc.name}</div><div>ID: {fmtPairFrInch(gc?.id_mm)} ／ OD: {fmtPairFrInch(gc?.od_mm)} ／ 長さ: {fmt.cm(gc?.length_cm)}</div></div>
                ) : (<div className="mt-1 text-xs opacity-70">未選択（なし）</div>)}
              </div>

              <div>
                <Label className="text-white">中間</Label>
                <Select value={icId} onValueChange={(v) => setIcId(v)}>
                  <SelectTrigger className="w-full text-white"><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {interList.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                {ic ? (
                  <div className="mt-1 text-xs"><div className="font-semibold">{ic.name}</div><div>ID: {fmtPairFrInch(ic?.id_mm)} ／ OD: {fmtPairFrInch(ic?.od_mm)} ／ 長さ: {fmt.cm(ic?.length_cm)}</div></div>
                ) : (<div className="mt-1 text-xs opacity-70">未選択（なし）</div>)}
              </div>

              <div>
                <Label className="text-white">マイクロ A</Label>
                <Select value={mcAId} onValueChange={(v) => setMcAId(v)}>
                  <SelectTrigger className="w-full text-white"><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {microList.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                {mcA ? (
                  <div className="mt-1 text-xs"><div className="font-semibold">{mcA.name}</div><div>OD: {fmtPairFrInch(mcA?.od_mm)} ／ ID: {fmtPairFrInch(mcA?.id_mm)} ／ 長さ: {fmt.cm(mcA?.length_cm)}</div></div>
                ) : (<div className="mt-1 text-xs opacity-70">未選択（なし）</div>)}
              </div>

              <div>
                <Label className="text-white">マイクロ B</Label>
                <Select value={mcBId} onValueChange={(v) => setMcBId(v)}>
                  <SelectTrigger className="w-full text-white"><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {microList.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                {mcB ? (
                  <div className="mt-1 text-xs"><div className="font-semibold">{mcB.name}</div><div>OD: {fmtPairFrInch(mcB?.od_mm)} ／ ID: {fmtPairFrInch(mcB?.id_mm)} ／ 長さ: {fmt.cm(mcB?.length_cm)}</div></div>
                ) : (<div className="mt-1 text-xs opacity-70">未選択（なし）</div>)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 可視化 */}
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader className="relative text-white p-4 py-3">
            <CardTitle className="text-white">可視化</CardTitle>
            <div className="absolute inset-0 flex items-center justify-center">
              {anyIssue && (
                <div className="inline-flex items-center gap-2 rounded border border-red-400/50 bg-red-500/10 px-2 py-1 text-red-300">
                  {/* 最小アイコンは省略可。必要なら既存のIconAlert/IconCheckを戻してください */}
                  <span className="font-semibold">適合性問題あり</span>
                </div>
              )}
              {!anyIssue && allGood && (
                <div className="inline-flex items-center gap-2 rounded border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                  <span className="font-semibold">適合性問題なし</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="relative p-4 pt-3">
            <div className="space-y-4">
              <LengthVisualizer gc={gc} ic={ic} mcA={mcA} mcB={mcB} />
              <CrossSectionVisualizer
                gc={gc}
                ic={ic}
                mcA={mcA}
                mcB={mcB}
                icInGcOK={icInGcOK}
                mcAInIcOK={mcAInIcOK}
                mcBInIcOK={mcBInIcOK}
                twoInIcOK={twoInIcOK}
                clearanceMm={CLEARANCE_MM}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
