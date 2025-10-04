"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/**
 * 変更点（最小限・page.tsx と同等の自動CSV読込を追加）
 * - GOOGLE_SHEET_CSV_URL 定数を追加（env: NEXT_PUBLIC_DEVICE_CSV_URL が優先）。
 * - 引用符対応の parseCSV / csvToDevices を追加。
 * - マウント時に Googleスプレッドシート（公開CSV）を fetch → 既存データにマージ。
 * - UI／レイアウト／判定ロジック（Dual Micro, 0.0mm）は一切変更なし。
 */

/* ========= 公開CSV URL（page.tsx互換） ========= */
const GOOGLE_SHEET_CSV_URL =
  process.env.NEXT_PUBLIC_DEVICE_CSV_URL ??
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSgVsdmTcaWlepz42z8pHGNGn5VjT9FADDr-Tl4Nm7dEw7IxoeBXJJ-TEMm1qXzCbntsa2-94h43fbF/pub?output=csv";

// --- Minimal inline icons ---
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

/* ========= CSV パーサ（page.tsx相当・引用符/改行対応） ========= */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      row.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); row = []; cell = ""; }
      if (ch === "\r" && next === "\n") i++;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

function csvToDevices(text: string): Device[] {
  const table = parseCSV(text);
  if (table.length < 2) return [];
  const header = table[0].map(h => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex(h => names.includes(h));

  const nameI = idx(["name", "名称", "製品名"]);
  const catI  = idx(["category", "カテゴリ"]);
  const makerI= idx(["maker", "メーカー"]);
  const idMmI = idx(["id_mm", "内径_mm"]);
  const odMmI = idx(["od_mm", "外径_mm"]);
  const lenI  = idx(["length_cm", "長さ_cm"]);
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

// --- ダミーデータ（後でCSV差替え可） ---
const SAMPLE_DEVICES: Device[] = [];

// --- 小さな表示用チップ ---
const Chip = ({ children, ok }: { children: React.ReactNode; ok?: boolean }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
    ok === undefined ? "border-slate-500/50 text-white" : ok ? "border-emerald-400 text-white" : "border-red-400 text-white"
  }`}>{children}</span>
);

// --- 判定ロジック ---
function useCompatibility(
  gc?: Device,
  ic?: Device,
  mcA?: Device,
  mcB?: Device,
  clearanceMm: number = 0.025
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
      const need = (mcA!.od_mm! + mcB!.od_mm!) + 1 * clearanceMm; // 固定：加算方式 + 片側クリアランス
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

// Fr と inch の併記（mm→Fr と mm→inch を同時表示）
const fmtPairFrInch = (mm?: number) => {
  if (typeof mm !== "number" || isNaN(mm) || mm <= 0) return "—";
  const fr = mmToFr(mm);
  const inch = mmToInch(mm);
  return `${fr.toFixed(1)} Fr (${inch.toFixed(3)} in)`;
};

// --- 可視化（横棒・同一スケール） ---
function LengthVisualizer({ gc, ic, mcA, mcB }: { gc?: Device; ic?: Device; mcA?: Device; mcB?: Device }) {
  const maxLen = Math.max(gc?.length_cm || 0, ic?.length_cm || 0, mcA?.length_cm || 0, mcB?.length_cm || 0, 120);

  const containerW = 760; // px
  const pxPerCm = containerW / maxLen;
  const x0 = 36; // 左余白

  // Yコネクタ（GC・IC とも 10 cm 仮定）
  const yGcCm = 10; const yIcCm = 10;
  const yGcW = yGcCm * pxPerCm; const yIcW = yIcCm * pxPerCm;

  // 太さ(px) - 相対関係維持：すべて OD(mm)×定数
  const pxPerMm = 8;
  const gcTh = gc?.od_mm ? gc.od_mm * pxPerMm : 0;
  const icTh = ic?.od_mm ? ic.od_mm * pxPerMm : 0;
  const mcATh = mcA?.od_mm ? mcA.od_mm * pxPerMm : 0;
  const mcBTh = mcB?.od_mm ? mcB.od_mm * pxPerMm : 0;

  // 縦スケールはコネクタの見た目調整にのみ使用（本体バー厚は変更しない）
  const yScale = 1.15;
  const yGcH = gcTh * yScale;
  const yIcH = icTh * yScale;

  const maxTh = Math.max(gcTh, icTh, mcATh, mcBTh, 24);
  const microGap = 8; // px（縦の間隔目安）
  const stackTh = (mcATh > 0 && mcBTh > 0) ? (mcATh + mcBTh + microGap) : Math.max(mcATh, mcBTh);
  const layoutTh = Math.max(maxTh, stackTh);
  const centerY = 12 + layoutTh / 2; // バー中心
  const axisY = centerY + layoutTh / 2 + 18; // 目盛ベース
  const containerH = axisY + 26; // 全体高さ

  const gcW = (gc?.length_cm || 0) * pxPerCm;
  const icW = (ic?.length_cm || 0) * pxPerCm;
  const mcAW = (mcA?.length_cm || 0) * pxPerCm;
  const mcBW = (mcB?.length_cm || 0) * pxPerCm;

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

  // マイクロ配置
  const icTop = centerY - icTh / 2;
  const mcAVisible = !!(mcA && mcAW > 0 && mcATh > 0);
  const mcBVisible = !!(mcB && mcBW > 0 && mcBTh > 0);

  let mcATopRel = (icTh - mcATh) / 2; // 単独: 中央
  let mcBTopRel = (icTh - mcBTh) / 2;
  if (mcAVisible && mcBVisible) {
    const gap = 0; // 二本併用時は隣接
    const total = mcATh + mcBTh + gap;
    if (total <= icTh) {
      const start = (icTh - total) / 2;
      mcATopRel = start;
      mcBTopRel = start + mcATh + gap;
    } else {
      mcATopRel = 0;
      mcBTopRel = Math.max(0, icTh - mcBTh);
    }
  }
  const mcATopAbs = icTop + mcATopRel;
  const mcBTopAbs = icTop + mcBTopRel;

  return (
    <div className="w-full">
      <div className="relative mx-auto" style={{ height: containerH, width: containerW + 260 }}>
        {/* 目盛り軸 */}
        <div className="absolute bg-slate-600" style={{ left: x0, top: axisY, height: 1, width: containerW }} />
        {majors.map(cm => (
          <div key={`M${cm}`} className="absolute" style={{ left: x0 + cm * pxPerCm, top: axisY - 8 }}>
            <div className="bg-slate-300" style={{ width: 1, height: 12 }} />
            <div className="text-[10px] text-white -translate-x-1/2 mt-0.5">{cm} cm</div>
          </div>
        ))}
        {minors.map(cm => (
          <div key={`m${cm}`} className="absolute bg-slate-500" style={{ left: x0 + cm * pxPerCm, top: axisY - 6, width: 1, height: 8 }} />
        ))}

        {/* Yコネクタ（GC, IC 各5cm） */}
        {gc && gcW > 0 && (
          <div className="absolute" style={{ left: gcTipX, top: centerY - yGcH / 2, height: yGcH, width: yGcW, zIndex: 30, overflow: 'visible' }}>
            <YConn w={yGcW} h={yGcH} baseH={yGcH} />
          </div>
        )}
        {ic && icW > 0 && (
          <div className="absolute" style={{ left: icTipX, top: centerY - yIcH / 2, height: yIcH, width: yIcW, zIndex: 20, overflow: 'visible' }}>
            <YConn w={yIcW} h={yIcH} baseH={yIcH} />
          </div>
        )}

        {/* IC本体 */}
        <div className="absolute bg-emerald-50 border border-emerald-400" style={{ left: x0, top: centerY - icTh / 2, height: icTh, width: icW, opacity: 0.85, zIndex: 20 }} />

        {/* マイクロ */}
        {mcAVisible && (
          <div className="absolute bg-sky-50 border border-sky-400" style={{ left: x0, top: mcATopAbs, height: mcATh, width: mcAW, opacity: 0.9, zIndex: 15 }} />
        )}
        {mcBVisible && (
          <div className="absolute bg-violet-50 border border-violet-400" style={{ left: x0, top: mcBTopAbs, height: mcBTh, width: mcBW, opacity: 0.9, zIndex: 15 }} />
        )}

        {/* ガイディング */}
        <div className="absolute bg-pink-100 border border-pink-400 shadow-sm" style={{ left: x0, top: centerY - gcTh / 2, height: gcTh, width: gcW, opacity: 0.85, zIndex: 30 }} />

        {/* ラベル */}
        <div className="absolute text-xs text-white" style={{ top: 4, left: x0 + containerW + 32 }}>
          <div>GC 全長：{fmt.cm(gc?.length_cm)}</div>
          <div>IC 全長：{fmt.cm(ic?.length_cm)}</div>
          <div>MC A 全長：{fmt.cm(mcA?.length_cm)}</div>
          <div>MC B 全長：{fmt.cm(mcB?.length_cm)}</div>
          <div className="mt-1">GC と IC の差：{fmt.cm(icMinusGcCm)}</div>
          <div>IC と MC A の差：{fmt.cm(mcAMinusIcCm)}</div>
          <div>IC と MC B の差：{fmt.cm(mcBMinusIcCm)}</div>
        </div>
      </div>
    </div>
  );
}

// --- 断面図ビジュアライザ ---
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
  const size = 240; // パネル一辺
  const margin = 12;

  // --- 単一のネスト断面図（簡略） ---
  const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs opacity-80">{title}</div>
      <div style={{ width: size, height: size }} className="bg-slate-900/40 rounded-md border border-slate-700 flex items-center justify-center">
        {children}
      </div>
    </div>
  );

  const nested = (() => {
    const hasGC = !!(gc?.od_mm && gc?.id_mm);
    const hasIC = !!(ic?.od_mm && ic?.id_mm);
    const hasMicro = !!((mcA?.od_mm || 0) > 0 || (mcB?.od_mm || 0) > 0);

    if (!hasGC && !hasIC && !hasMicro) { return <div className="text-xs opacity-70">未選択</div>; }

    const outer: number[] = [];
    if (gc?.od_mm) outer.push(gc.od_mm);
    if (ic?.od_mm) outer.push(ic.od_mm);
    if (mcA?.od_mm) outer.push(mcA.od_mm);
    if (mcB?.od_mm) outer.push(mcB.od_mm);
    const maxMm = Math.max(...outer);
    const pxPerMm = (size - margin * 2) / maxMm;

    const cx = size / 2, cy = size / 2;

    const rGcOd = gc?.od_mm ? (gc.od_mm / 2) * pxPerMm : undefined;
    const rGcId = gc?.id_mm ? (gc.id_mm / 2) * pxPerMm : undefined;
    const rIcOd = ic?.od_mm ? (ic.od_mm / 2) * pxPerMm : undefined;
    const rIcId = ic?.id_mm ? (ic.id_mm / 2) * pxPerMm : undefined;

    const odA = mcA?.od_mm || 0; const idA = mcA?.id_mm || 0;
    const odB = mcB?.od_mm || 0; const idB = mcB?.id_mm || 0;
    const rAod = (odA / 2) * pxPerMm; const rAid = (idA / 2) * pxPerMm;
    const rBod = (odB / 2) * pxPerMm; const rBid = (idB / 2) * pxPerMm;

    const xA = cx - rBod; const xB = cx + rAod; const y = cy;

    const gcColor = '#ec4899';   // pink-500
    const icColor = '#10b981';   // emerald-500
    const aColor  = '#3b82f6';   // blue-500
    const bColor  = '#8b5cf6';   // violet-500

    const strokeIc = hasGC && hasIC ? ((icInGcOK === false) ? '#ef4444' : icColor) : icColor;
    const strokeA   = hasIC ? ((mcAInIcOK === false) ? '#ef4444' : aColor) : aColor;
    const strokeB   = hasIC ? ((mcBInIcOK === false) ? '#ef4444' : bColor) : bColor;

    const Ring = ({ cx, cy, rOuter, rInner, color }: { cx: number; cy: number; rOuter?: number; rInner?: number; color: string }) => {
      if (rOuter === undefined || rInner === undefined) return null;
      const r = (rOuter + rInner) / 2; const w = Math.max(0, rOuter - rInner);
      return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={w} />;
    };

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {hasGC && <Ring cx={cx} cy={cy} rOuter={rGcOd} rInner={rGcId} color={gcColor} />}
        {hasIC && <Ring cx={cx} cy={cy} rOuter={rIcOd} rInner={rIcId} color={strokeIc} />}
        {mcA && odA > 0 && (
          <g>
            <Ring cx={xA} cy={y} rOuter={rAod} rInner={Math.max(0, rAid)} color={strokeA} />
            <circle cx={xA} cy={y} r={rAod} fill="none" stroke={strokeA} strokeWidth={2} />
            {idA > 0 && <circle cx={xA} cy={y} r={rAid} fill="none" stroke={strokeA} strokeWidth={2} />}
          </g>
        )}
        {mcB && odB > 0 && (
          <g>
            <Ring cx={xB} cy={y} rOuter={rBod} rInner={Math.max(0, rBid)} color={strokeB} />
            <circle cx={xB} cy={y} r={rBod} fill="none" stroke={strokeB} strokeWidth={2} />
            {idB > 0 && <circle cx={xB} cy={y} r={rBid} fill="none" stroke={strokeB} strokeWidth={2} />}
          </g>
        )}
      </svg>
    );
  })();

  return (
    <div className="grid grid-cols-1 gap-4">
      <Panel title="断面図">
        {nested}
      </Panel>
    </div>
  );
}

export default function App() {
  const [devices, setDevices] = useState<Device[]>(SAMPLE_DEVICES);

  /* ========= 追加：GoogleスプレッドシートのCSVを自動読込 ========= */
  const fetchCSV = useCallback(async () => {
    try {
      const url = `${GOOGLE_SHEET_CSV_URL}&t=${Date.now()}`; // no-cache
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const out = csvToDevices(text);
      if (out.length === 0) return;
      setDevices(prev => {
        const byKey = new Map<string, Device>();
        const all = [...prev, ...out];
        for (const d of all) {
          const key = `${d.category}::${d.name}`; // 同名は上書き
          byKey.set(key, d);
        }
        return Array.from(byKey.values());
      });
    } catch (e) {
      console.error("CSV fetch failed:", e);
    }
  }, []);

  useEffect(() => { void fetchCSV(); }, [fetchCSV]);
  /* ========= 追加ここまで ========= */

  const guidingList = useMemo(() => devices.filter(d => d.category === "ガイディング"), [devices]);
  const interList   = useMemo(() => devices.filter(d => d.category === "中間"), [devices]);
  const microList   = useMemo(() => devices.filter(d => d.category === "マイクロ"), [devices]);

  const [gcId, setGcId] = useState<string>(guidingList[0]?.id || "");
  const [icId, setIcId] = useState<string>(interList[0]?.id || "");
  const [mcAId, setMcAId] = useState<string>(microList[0]?.id || "");
  const [mcBId, setMcBId] = useState<string>(microList[1]?.id || microList[0]?.id || "");

  const CLEARANCE_MM = 0.0;

  const gc  = useMemo(() => devices.find(d => d.id === gcId), [devices, gcId]);
  const ic  = useMemo(() => devices.find(d => d.id === icId), [devices, icId]);
  const mcA = useMemo(() => devices.find(d => d.id === mcAId), [devices, mcAId]);
  const mcB = useMemo(() => devices.find(d => d.id === mcBId), [devices, mcBId]);

  const { icInGcOK, mcAInIcOK, mcBInIcOK, twoInIcOK, gcIcDiffCm, icMcADiffCm, icMcBDiffCm, gcIcDiffOK, icMcADiffOK, icMcBDiffOK } =
    useCompatibility(gc, ic, mcA, mcB, CLEARANCE_MM);

  const anyIssue = [icInGcOK, mcAInIcOK, mcBInIcOK, twoInIcOK, gcIcDiffOK, icMcADiffOK, icMcBDiffOK].some(v => v === false);
  const allGood  = [icInGcOK, mcAInIcOK, mcBInIcOK, twoInIcOK, gcIcDiffOK, icMcADiffOK, icMcBDiffOK].every(v => v === true);

  // 既存のCSV手動取り込み（そのまま維持）
  const handleCsvImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        // 既存の軽量パーサは温存しつつ、堅牢パーサに差し替え
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

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4">
      <div className="max-w-6xl mx-auto grid gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Neuro-endo-checker (Ver 1.0)</h1>
          <div className="text-xs text-white">v1.1.3 (dual-micro, fixed sum+0.0mm)</div>
        </div>

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
              <div className="sm:col-start-1 sm:row-start-1 md:col-start-1 md:row-start-1">
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

              <div className="sm:col-start-2 sm:row-start-1 md:col-start-2 md:row-start-1">
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

              <div className="md:col-span-1 sm:col-start-1 sm:row-start-2 md:col-start-3 md:row-start-1">
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

              <div className="md:col-span-1 sm:col-start-1 sm:row-start-3 md:col-start-3 md:row-start-2">
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
                  <IconAlert className="h-4 w-4"/>
                  <span className="font-semibold">適合性問題あり</span>
                </div>
              )}
              {!anyIssue && allGood && (
                <div className="inline-flex items-center gap-2 rounded border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                  <IconCheck className="h-4 w-4"/>
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
