"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/**
 * 公開CSVのURL（環境変数優先）
 * 例: NEXT_PUBLIC_DEVICE_CSV_URL=https://docs.google.com/spreadsheets/d/e/.../pub?output=csv
 */
const GOOGLE_SHEET_CSV_URL =
  process.env.NEXT_PUBLIC_DEVICE_CSV_URL ??
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSgVsdmTcaWlepz42z8pHGNGn5VjT9FADDr-Tl4Nm7dEw7IxoeBXJJ-TEMm1qXzCbntsa2-94h43fbF/pub?output=csv";

/* =========================
   型 & ユーティリティ
========================= */

type Category = "ガイディング" | "中間" | "マイクロ";

type Device = {
  id: string;
  name: string;
  maker?: string;
  category: Category;
  id_mm?: number; // 内径(mm)
  od_mm?: number; // 外径(mm)
  length_cm?: number; // 長さ(cm)
  id_inch?: number;
  od_fr?: number;
  notes?: string;
};

const inchToMm = (inch: number) => inch * 25.4;
const frToMm = (fr: number) => fr * 0.33;
const mmToInch = (mm: number) => mm / 25.4;
const mmToFr = (mm: number) => mm / 0.33;

const SAMPLE_DEVICES: Device[] = [
  { id: "gc-1", name: "GC A ID 0.088in", maker: "SampleCo", category: "ガイディング", id_mm: inchToMm(0.088), od_mm: frToMm(8), length_cm: 100 },
  { id: "ic-1", name: "IC A 5.5Fr / ID 0.058in", maker: "SampleCo", category: "中間", id_mm: inchToMm(0.058), od_mm: frToMm(5.5), length_cm: 115 },
  { id: "mc-1", name: "MC A 0.017in / 2.4Fr", maker: "SampleCo", category: "マイクロ", id_mm: inchToMm(0.017), od_mm: frToMm(2.4), length_cm: 160 },
  { id: "mc-2", name: "MC B 0.021in / 2.7Fr", maker: "SampleCo", category: "マイクロ", id_mm: inchToMm(0.021), od_mm: frToMm(2.7), length_cm: 156 },
];

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
  if (v == null) return undefined;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

/** CSV文字列 → Device[]（列名は大小/日本語のゆらぎを吸収） */
function csvToDevices(text: string): Device[] {
  const table = parseCSV(text);
  if (table.length < 2) throw new Error("CSVにデータ行がありません");
  const header = table[0].map(normalizeHeader);

  const col = (...names: string[]) => {
    const idx = header.findIndex((h) => names.map(normalizeHeader).includes(h));
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
    const category: Category =
      catRaw.includes("ガイ") ? "ガイディング" : catRaw.includes("中間") || catRaw.toLowerCase().includes("inter") ? "中間" : "マイクロ";

    const maker = idxMaker >= 0 ? row[idxMaker]?.trim() : undefined;

    const idMm = toNumber(idxIdMm >= 0 ? row[idxIdMm] : undefined);
    const odMm = toNumber(idxOdMm >= 0 ? row[idxOdMm] : undefined);
    const idIn = toNumber(idxIdIn >= 0 ? row[idxIdIn] : undefined);
    const odFr = toNumber(idxOdFr >= 0 ? row[idxOdFr] : undefined);
    const lengthCm = toNumber(idxLen >= 0 ? row[idxLen] : undefined);
    const notes = idxNotes >= 0 ? row[idxNotes]?.trim() : undefined;

    const id = (idxId >= 0 && row[idxId]?.trim()) || `${category}::${name}`;

    const id_mm = idMm ?? (idIn != null ? inchToMm(idIn) : undefined);
    const od_mm = odMm ?? (odFr != null ? frToMm(odFr) : undefined);

    out.push({
      id,
      name,
      maker,
      category,
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

/** 適合判定 */
function useCompatibility(
  gc?: Device,
  ic?: Device,
  mcA?: Device,
  mcB?: Device,
  clearanceMm: number = 0.0
) {
  return useMemo(() => {
    const mmOk = (x?: number) => typeof x === "number" && !Number.isNaN(x) && x > 0;

    const icInGcOK = mmOk(gc?.id_mm) && mmOk(ic?.od_mm) ? ic!.od_mm! + clearanceMm <= gc!.id_mm! : undefined;
    const mcAInIcOK = mmOk(ic?.id_mm) && mmOk(mcA?.od_mm) ? mcA!.od_mm! + clearanceMm <= ic!.id_mm! : undefined;
    const mcBInIcOK = mmOk(ic?.id_mm) && mmOk(mcB?.od_mm) ? mcB!.od_mm! + clearanceMm <= ic!.id_mm! : undefined;

    let twoInIcOK: boolean | undefined;
    if (mmOk(ic?.id_mm) && mmOk(mcA?.od_mm) && mmOk(mcB?.od_mm)) {
      const need = mcA!.od_mm! + mcB!.od_mm! + 2 * clearanceMm;
      twoInIcOK = need <= ic!.id_mm!;
    }

    const diff = (a?: number, b?: number) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) : undefined);
    const gcIcDiffCm = diff(gc?.length_cm, ic?.length_cm);
    const icMcADiffCm = diff(ic?.length_cm, mcA?.length_cm);
    const icMcBDiffCm = diff(ic?.length_cm, mcB?.length_cm);

    const ok20 = (v?: number) => (v !== undefined ? v >= 20 : undefined);

    return {
      icInGcOK,
      mcAInIcOK,
      mcBInIcOK,
      twoInIcOK,
      gcIcDiffCm,
      icMcADiffCm,
      icMcBDiffCm,
      gcIcDiffOK: ok20(gcIcDiffCm),
      icMcADiffOK: ok20(icMcADiffCm),
      icMcBDiffOK: ok20(icMcBDiffCm),
    } as const;
  }, [gc, ic, mcA, mcB, clearanceMm]);
}

/* =========================
   表示ヘルパ
========================= */

const fmt = {
  cm: (v?: number) => (typeof v === "number" ? `${v.toFixed(1)} cm` : "—"),
};
const fmtPairFrInch = (mm?: number) => {
  if (typeof mm !== "number" || Number.isNaN(mm) || mm <= 0) return "—";
  return `${mmToFr(mm).toFixed(1)} Fr (${mmToInch(mm).toFixed(3)} in)`;
};

/* =========================
   可視化（簡潔・未使用変数なし）
========================= */

function LengthVisualizer({ gc, ic, mcA, mcB }: { gc?: Device; ic?: Device; mcA?: Device; mcB?: Device }) {
  // 最大長を求めて横スケール決定
  const maxLen = Math.max(gc?.length_cm ?? 0, ic?.length_cm ?? 0, mcA?.length_cm ?? 0, mcB?.length_cm ?? 0, 120);
  const widthPx = 860;
  const pxPerCm = maxLen > 0 ? widthPx / maxLen : 1;

  const bar = (lenCm?: number, height = 10, color = "#60a5fa") => {
    const w = (lenCm ?? 0) * pxPerCm;
    return <div style={{ width: Math.max(2, w), height, background: color, borderRadius: 4 }} />;
  };

  return (
    <div className="grid grid-cols-1 gap-2 text-sm">
      <div className="flex items-center gap-3">
        <div className="w-28 shrink-0 opacity-80">ガイディング</div>
        {bar(gc?.length_cm, 14, "#f59e0b")}
        <div className="w-36 text-right">{fmt.cm(gc?.length_cm)}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-28 shrink-0 opacity-80">中間</div>
        {bar(ic?.length_cm, 14, "#22c55e")}
        <div className="w-36 text-right">{fmt.cm(ic?.length_cm)}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-28 shrink-0 opacity-80">マイクロ A</div>
        {bar(mcA?.length_cm, 10, "#60a5fa")}
        <div className="w-36 text-right">{fmt.cm(mcA?.length_cm)}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-28 shrink-0 opacity-80">マイクロ B</div>
        {bar(mcB?.length_cm, 10, "#a78bfa")}
        <div className="w-36 text-right">{fmt.cm(mcB?.length_cm)}</div>
      </div>
      <div className="mt-2 text-xs opacity-70">目盛：{Math.ceil(maxLen / 10) * 10} cm スケール</div>
    </div>
  );
}

function CrossSectionVisualizer({
  gc,
  ic,
  mcA,
  mcB,
  icInGcOK,
  mcAInIcOK,
  mcBInIcOK,
  twoInIcOK,
  clearanceMm,
}: {
  gc?: Device;
  ic?: Device;
  mcA?: Device;
  mcB?: Device;
  icInGcOK?: boolean;
  mcAInIcOK?: boolean;
  mcBInIcOK?: boolean;
  twoInIcOK?: boolean;
  clearanceMm: number;
}) {
  const scale = 10; // px per mm
  const size = 160;

  const circle = (mm?: number, stroke = "#94a3b8", fill = "transparent", title?: string) => {
    const r = typeof mm === "number" ? (mm / 2) * scale : 0;
    return (
      <svg width={size} height={size}>
        <title>{title}</title>
        <circle cx={size / 2} cy={size / 2} r={Math.max(0, r)} stroke={stroke} fill={fill} strokeWidth={2} />
      </svg>
    );
  };

  const badge = (ok: boolean | undefined, label: string) => {
    if (ok === undefined) return <span className="text-xs opacity-60">{label}: 未判定</span>;
    return (
      <span
        className={`text-xs px-2 py-0.5 rounded border ${
          ok ? "border-emerald-400 text-emerald-200" : "border-red-400 text-red-200"
        }`}
      >
        {label}: {ok ? "OK" : "NG"}
      </span>
    );
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-24 text-sm opacity-80">IC 内に GC 外径</div>
        <div className="flex items-center gap-3">
          {circle(ic?.id_mm, "#22c55e", "transparent", "IC ID")}
          {circle(gc?.od_mm, "#f59e0b", "transparent", "GC OD")}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="shrink-0 w-24 text-sm opacity-80">IC 内に Micro 2本</div>
        <div className="flex items-center gap-3">
          {circle(ic?.id_mm, "#22c55e", "transparent", "IC ID")}
          {circle((mcA?.od_mm ?? 0) + (mcB?.od_mm ?? 0) + 2 * clearanceMm, "#60a5fa", "transparent", "MC A+B (概算)")}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {badge(icInGcOK, "IC in GC")}
        {badge(mcAInIcOK, "MC A in IC")}
        {badge(mcBInIcOK, "MC B in IC")}
        {badge(twoInIcOK, "2本 in IC")}
      </div>
    </div>
  );
}

/* =========================
   メイン
========================= */

export default function App() {
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);

  /** 公開CSVを取得（useCallbackで依存を固定） */
  const fetchRemoteCSV = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const url = `${GOOGLE_SHEET_CSV_URL}&t=${Date.now()}`; // キャッシュ回避
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = csvToDevices(text);
      if (parsed.length === 0) throw new Error("データが空です");
      const map = new Map<string, Device>();
      for (const d of parsed) map.set(d.id || `${d.category}::${d.name}`, d);
      setDevices(Array.from(map.values()));
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error("unknown error");
      console.error(err);
      setLoadError(`公開CSVの読み込みに失敗しました：${err.message}`);
      setDevices(SAMPLE_DEVICES);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 初回ロード */
  useEffect(() => {
    void fetchRemoteCSV();
  }, [fetchRemoteCSV]);

  // カテゴリ別
  const guidingList = useMemo(() => devices.filter((d) => d.category === "ガイディング"), [devices]);
  const interList = useMemo(() => devices.filter((d) => d.category === "中間"), [devices]);
  const microList = useMemo(() => devices.filter((d) => d.category === "マイクロ"), [devices]);

  // 選択（非同期ロード後に先頭自動選択）
  const [gcId, setGcId] = useState<string>("");
  const [icId, setIcId] = useState<string>("");
  const [mcAId, setMcAId] = useState<string>("");
  const [mcBId, setMcBId] = useState<string>("");

  useEffect(() => {
    if (!gcId && guidingList[0]?.id) setGcId(guidingList[0].id);
    if (!icId && interList[0]?.id) setIcId(interList[0].id);
    if (!mcAId && microList[0]?.id) setMcAId(microList[0].id);
    if (!mcBId && (microList[1]?.id || microList[0]?.id)) setMcBId(microList[1]?.id ?? microList[0]?.id ?? "");
  }, [gcId, icId, mcAId, mcBId, guidingList, interList, microList]);

  const CLEARANCE_MM = 0.0;

  const gc = useMemo(() => devices.find((d) => d.id === gcId), [devices, gcId]);
  const ic = useMemo(() => devices.find((d) => d.id === icId), [devices, icId]);
  const mcA = useMemo(() => devices.find((d) => d.id === mcAId), [devices, mcAId]);
  const mcB = useMemo(() => devices.find((d) => d.id === mcBId), [devices, mcBId]);

  const {
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
  } = useCompatibility(gc, ic, mcA, mcB, CLEARANCE_MM);

  const anyIssue = [icInGcOK, mcAInIcOK, mcBInIcOK, twoInIcOK, gcIcDiffOK, icMcADiffOK, icMcBDiffOK].some((v) => v === false);
  const allGood = [icInGcOK, mcAInIcOK, mcBInIcOK, twoInIcOK, gcIcDiffOK, icMcADiffOK, icMcBDiffOK].every((v) => v === true);

  /** 手動CSV取り込み（差分マージ） */
  const handleCsvImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev: ProgressEvent<FileReader>) => {
      try {
        const resultStr = typeof ev.target?.result === "string" ? ev.target.result : "";
        const parsed = csvToDevices(resultStr);
        setDevices((prev) => {
          const map = new Map<string, Device>();
          for (const d of prev) map.set(d.id || `${d.category}::${d.name}`, d);
          for (const d of parsed) map.set(d.id || `${d.category}::${d.name}`, d);
          return Array.from(map.values());
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error("unknown error");
        // eslint-disable-next-line no-alert
        alert(`CSV読込に失敗しました：${e.message}`);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const onSelectValue = (setter: (v: string) => void) => (v: string) => {
    setter(v === "__none__" ? "" : v);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4">
      <div className="max-w-6xl mx-auto grid gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Neuro-endo-checker</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => void fetchRemoteCSV()} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs" title="公開CSVを再読み込み">
              更新
            </button>
            <div className="text-xs text-white">auto-fetch from Google Sheets</div>
          </div>
        </div>

        {loading && (
          <Card className="bg-slate-800 border-slate-700 text-white">
            <CardContent className="p-4">公開CSVを読み込んでいます…</CardContent>
          </Card>
        )}

        {loadError && (
          <Card className="bg-amber-900/20 border-amber-700 text-amber-100">
            <CardContent className="p-3 text-sm">{loadError}（フォールバックの内蔵サンプルで動作中）</CardContent>
          </Card>
        )}

        {/* セレクター */}
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader className="text-white p-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-white">デバイス選択</CardTitle>
              <label className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 cursor-pointer text-xs">
                <input type="file" accept=".csv" onChange={(e) => e.target.files && handleCsvImport(e.target.files[0])} className="hidden" />
                CSV取込
              </label>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
              <div>
                <Label className="text-white">ガイディング</Label>
                <Select value={gcId} onValueChange={onSelectValue(setGcId)}>
                  <SelectTrigger className="w-full text-white">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {guidingList.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {gc ? (
                  <div className="mt-1 text-xs">
                    <div className="font-semibold">{gc.name}</div>
                    <div>ID: {fmtPairFrInch(gc.id_mm)} ／ OD: {fmtPairFrInch(gc.od_mm)} ／ 長さ: {fmt.cm(gc.length_cm)}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-xs opacity-70">未選択（なし）</div>
                )}
              </div>

              <div>
                <Label className="text-white">中間</Label>
                <Select value={icId} onValueChange={onSelectValue(setIcId)}>
                  <SelectTrigger className="w-full text-white">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {interList.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ic ? (
                  <div className="mt-1 text-xs">
                    <div className="font-semibold">{ic.name}</div>
                    <div>ID: {fmtPairFrInch(ic.id_mm)} ／ OD: {fmtPairFrInch(ic.od_mm)} ／ 長さ: {fmt.cm(ic.length_cm)}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-xs opacity-70">未選択（なし）</div>
                )}
              </div>

              <div>
                <Label className="text-white">マイクロ A</Label>
                <Select value={mcAId} onValueChange={onSelectValue(setMcAId)}>
                  <SelectTrigger className="w-full text-white">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {microList.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mcA ? (
                  <div className="mt-1 text-xs">
                    <div className="font-semibold">{mcA.name}</div>
                    <div>OD: {fmtPairFrInch(mcA.od_mm)} ／ ID: {fmtPairFrInch(mcA.id_mm)} ／ 長さ: {fmt.cm(mcA.length_cm)}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-xs opacity-70">未選択（なし）</div>
                )}
              </div>

              <div>
                <Label className="text-white">マイクロ B</Label>
                <Select value={mcBId} onValueChange={onSelectValue(setMcBId)}>
                  <SelectTrigger className="w-full text-white">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
                    {microList.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mcB ? (
                  <div className="mt-1 text-xs">
                    <div className="font-semibold">{mcB.name}</div>
                    <div>OD: {fmtPairFrInch(mcB.od_mm)} ／ ID: {fmtPairFrInch(mcB.id_mm)} ／ 長さ: {fmt.cm(mcB.length_cm)}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-xs opacity-70">未選択（なし）</div>
                )}
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
              <div className="text-xs opacity-70">
                長さ差: GC-IC {gcIcDiffCm ?? "—"} cm / IC-MC A {icMcADiffCm ?? "—"} cm / IC-MC B {icMcBDiffCm ?? "—"} cm（20cm以上推奨）
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
