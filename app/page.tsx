"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/* ========= 公開CSV URL ========= */
const GOOGLE_SHEET_CSV_URL =
  process.env.NEXT_PUBLIC_DEVICE_CSV_URL ??
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSgVsdmTcaWlepz42z8pHGNGn5VjT9FADDr-Tl4Nm7dEw7IxoeBXJJ-TEMm1qXzCbntsa2-94h43fbF/pub?output=csv";

/* ========= アイコン ========= */
const IconCheck = ({ className = "h-5 w-5", color = "#059669" }: { className?: string; color?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconAlert = ({ className = "h-5 w-5", color = "#dc2626" }: { className?: string; color?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/* ========= 型 ========= */
type Category = "ガイディング" | "中間" | "マイクロ";
type Device = {
  id: string;
  name: string;
  maker?: string;
  category: Category;
  id_mm?: number;
  od_mm?: number;
  length_cm?: number;
  id_inch?: number;
  od_fr?: number;
  notes?: string;
};

/* ========= ユーティリティ ========= */
const inchToMm = (inch: number) => inch * 25.4;
const frToMm = (fr: number) => fr * 0.33;

const fmt = {
  mm: (v?: number) => (typeof v === "number" ? `${v.toFixed(2)} mm` : "—"),
  cm: (v?: number) => (typeof v === "number" ? `${v.toFixed(1)} cm` : "—"),
};

const Chip = ({ children, ok }: { children: React.ReactNode; ok?: boolean }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
      ok === undefined ? "border-slate-500/50 text-white" : ok ? "border-emerald-400 text-white" : "border-red-400 text-white"
    }`}
  >
    {children}
  </span>
);

/* ========= CSV パーサ ========= */
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
function toNumber(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : undefined;
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
    const category: Category =
      catI >= 0 && row[catI]?.includes("ガイ") ? "ガイディング" : catI >= 0 && row[catI]?.includes("中間") ? "中間" : "マイクロ";
    const id_mm = idMmI >= 0 && row[idMmI] ? Number(row[idMmI]) : idInI >= 0 && row[idInI] ? inchToMm(Number(row[idInI])) : undefined;
    const od_mm = odMmI >= 0 && row[odMmI] ? Number(row[odMmI]) : odFrI >= 0 && row[odFrI] ? frToMm(Number(row[odFrI])) : undefined;
    const length_cm = lenI >= 0 && row[lenI] ? Number(row[lenI]) : undefined;

    out.push({
      id: `csv-${i}`,
      name,
      category,
      maker: makerI >= 0 ? row[makerI] : undefined,
      id_mm,
      od_mm,
      length_cm,
    });
  }
  return out;
}

/* ========= 互換性ロジック ========= */
function useCompatibility(gc?: Device, ic?: Device, mc?: Device, clearanceMm = 0.1) {
  return useMemo(() => {
    const mmOk = (x?: number) => typeof x === "number" && x > 0;
    const icInGcOK = mmOk(gc?.id_mm) && mmOk(ic?.od_mm) ? ic!.od_mm! + clearanceMm <= gc!.id_mm! : undefined;
    const mcInIcOK = mmOk(ic?.id_mm) && mmOk(mc?.od_mm) ? mc!.od_mm! + clearanceMm <= ic!.id_mm! : undefined;
    const gcIcDiffCm = mmOk(gc?.length_cm) && mmOk(ic?.length_cm) ? Math.abs(gc!.length_cm! - ic!.length_cm!) : undefined;
    const icMcDiffCm = mmOk(ic?.length_cm) && mmOk(mc?.length_cm) ? Math.abs(ic!.length_cm! - mc!.length_cm!) : undefined;
    const gcIcDiffOK = gcIcDiffCm !== undefined ? gcIcDiffCm >= 20 : undefined;
    const icMcDiffOK = icMcDiffCm !== undefined ? icMcDiffCm >= 20 : undefined;
    return { icInGcOK, mcInIcOK, gcIcDiffCm, icMcDiffCm, gcIcDiffOK, icMcDiffOK } as const;
  }, [gc, ic, mc, clearanceMm]);
}

/* ========= 可視化 ========= */
function LengthVisualizer({ gc, ic, mc }: { gc?: Device; ic?: Device; mc?: Device }) {
  const maxLen = Math.max(gc?.length_cm ?? 0, ic?.length_cm ?? 0, mc?.length_cm ?? 0, 120);
  const containerW = 760;
  const pxPerCm = containerW / maxLen;
  const x0 = 36;
  const pxPerMm = 8;

  const gcTh = gc?.od_mm ? gc.od_mm * pxPerMm : 0;
  const icTh = ic?.od_mm ? ic.od_mm * pxPerMm : 0;
  const mcTh = mc?.od_mm ? mc.od_mm * pxPerMm : 0;
  const maxTh = Math.max(gcTh, icTh, mcTh, 16);

  const centerY = 16 + maxTh / 2;
  const axisY = centerY + maxTh / 2 + 20;
  const containerH = axisY + 28;

  const gcW = (gc?.length_cm ?? 0) * pxPerCm;
  const icW = (ic?.length_cm ?? 0) * pxPerCm;
  const mcW = (mc?.length_cm ?? 0) * pxPerCm;

  const majors = Array.from({ length: Math.floor(maxLen / 10) + 1 }, (_, i) => i * 10);

  return (
    <div className="w-full">
      <div className="relative mx-auto" style={{ height: containerH, width: containerW + 220 }}>
        <div className="absolute bg-slate-600" style={{ left: x0, top: axisY, height: 1, width: containerW }} />
        {majors.map((cm) => (
          <div key={cm} className="absolute" style={{ left: x0 + cm * pxPerCm, top: axisY - 8 }}>
            <div className="bg-slate-300" style={{ width: 1, height: 12 }} />
            <div className="text-[10px] text-white -translate-x-1/2 mt-0.5">{cm} cm</div>
          </div>
        ))}

        <div className="absolute bg-pink-100 border border-pink-400" style={{ left: x0, top: centerY - gcTh / 2, height: gcTh, width: gcW, opacity: 0.85 }} />
        <div className="absolute bg-emerald-50 border border-emerald-400" style={{ left: x0, top: centerY - icTh / 2, height: icTh, width: icW, opacity: 0.85 }} />
        <div className="absolute bg-sky-50 border border-sky-400" style={{ left: x0, top: centerY - mcTh / 2, height: mcTh, width: mcW, opacity: 0.85 }} />
      </div>
    </div>
  );
}

/* ========= メイン ========= */
export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchCSV = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${GOOGLE_SHEET_CSV_URL}&t=${Date.now()}`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = csvToDevices(text);
      setDevices(parsed);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error("unknown error");
      console.error(err);
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCSV();
  }, [fetchCSV]);

  const guidingList = useMemo(() => devices.filter((d) => d.category === "ガイディング"), [devices]);
  const interList = useMemo(() => devices.filter((d) => d.category === "中間"), [devices]);
  const microList = useMemo(() => devices.filter((d) => d.category === "マイクロ"), [devices]);

  const [gcId, setGcId] = useState("");
  const [icId, setIcId] = useState("");
  const [mcId, setMcId] = useState("");

  const gc = devices.find((d) => d.id === gcId);
  const ic = devices.find((d) => d.id === icId);
  const mc = devices.find((d) => d.id === mcId);

  const { icInGcOK, mcInIcOK, gcIcDiffCm, icMcDiffCm, gcIcDiffOK, icMcDiffOK } = useCompatibility(gc, ic, mc);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-6xl mx-auto grid gap-3">
        <h1 className="text-xl font-bold">脳血管内治療デバイス互換性チェッカー</h1>

        <Card>
          <CardHeader>
            <CardTitle>デバイス選択</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>ガイディング</Label>
                <Select value={gcId} onValueChange={setGcId}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>{guidingList.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>中間</Label>
                <Select value={icId} onValueChange={setIcId}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>{interList.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>マイクロ</Label>
                <Select value={mcId} onValueChange={setMcId}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>{microList.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>互換性チェック結果</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  {icInGcOK ? <IconCheck /> : <IconAlert />}
                  <Chip ok={icInGcOK}>OD(IC): {fmt.mm(ic?.od_mm)} ／ ID(GC): {fmt.mm(gc?.id_mm)}</Chip>
                </div>
                <div className="flex items-center gap-2">
                  {mcInIcOK ? <IconCheck /> : <IconAlert />}
                  <Chip ok={mcInIcOK}>OD(MC): {fmt.mm(mc?.od_mm)} ／ ID(IC): {fmt.mm(ic?.id_mm)}</Chip>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  {gcIcDiffOK ? <IconCheck /> : <IconAlert />}
                  <Chip ok={gcIcDiffOK}>差: {fmt.cm(gcIcDiffCm)} (≥20cm)</Chip>
                </div>
                <div className="flex items-center gap-2">
                  {icMcDiffOK ? <IconCheck /> : <IconAlert />}
                  <Chip ok={icMcDiffOK}>差: {fmt.cm(icMcDiffCm)} (≥20cm)</Chip>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>可視化</CardTitle></CardHeader>
          <CardContent><LengthVisualizer gc={gc} ic={ic} mc={mc} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
