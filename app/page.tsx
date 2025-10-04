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
