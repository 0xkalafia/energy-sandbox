import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a large number with Thai-friendly units (M, B). */
export function fmtNum(n: number, digits = 1): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(digits) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(digits) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(digits) + "k";
  return n.toFixed(digits);
}

/** Format energy: kWh → auto unit. */
export function fmtEnergy(kwh: number): string {
  const abs = Math.abs(kwh);
  if (abs >= 1e9) return (kwh / 1e9).toFixed(2) + " TWh";
  if (abs >= 1e6) return (kwh / 1e6).toFixed(2) + " GWh";
  if (abs >= 1e3) return (kwh / 1e3).toFixed(1) + " MWh";
  return kwh.toFixed(0) + " kWh";
}

/** Format power: MW → GW when large. */
export function fmtPower(mw: number): string {
  if (Math.abs(mw) >= 1000) return (mw / 1000).toFixed(2) + " GW";
  return mw.toFixed(0) + " MW";
}

/** Format Thai Baht. */
export function fmtBaht(baht: number): string {
  const abs = Math.abs(baht);
  if (abs >= 1e9) return "฿" + (baht / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return "฿" + (baht / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return "฿" + (baht / 1e3).toFixed(1) + "k";
  return "฿" + baht.toFixed(0);
}

/** Format percent 0-1 as XX.X% */
export function fmtPct(p: number, digits = 1): string {
  return (p * 100).toFixed(digits) + "%";
}
