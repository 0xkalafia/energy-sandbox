import { LIFESTYLE_SHAPE_24H, SOLAR_SHAPE_24H } from "@/data/constants";

/**
 * Residential-scale simulator for the user's actual home in Phetchaburi.
 * Everything is in kW / kWh (vs the provincial engine's MW / GWh).
 *
 * Defaults seeded from the real house:
 *   solar 4,380 W (plan 5,840 W), 2 roof faces N+S → CF ≈ 0.13,
 *   bill ฿2,500/mo, full-house ≈ 18.5 kWh/day, 2-person ≈ 40% of that,
 *   Neta V ≈ 38.5 kWh.
 */
export interface HouseInputs {
  solarW: number;
  capacityFactor: number; // 0..1 (0.13 for N+S split roof)
  monthlyBill: number; // ฿/mo (defines full-house consumption)
  tariff: number; // ฿/kWh (to back out kWh from the bill)
  occupancy: number; // 0..1 — fraction of full-house load actually used
  batteryKWh: number; // home battery (0 = none)
  batteryPricePerKWh: number; // ฿/kWh installed
  batteryRoundTrip: number; // 0..1
  sellPrice: number; // ฿/kWh export credit (0 = no net metering)
  evOn: boolean;
  evKWhPerDay: number; // EV charging demand added to the house
}

export const DEFAULT_HOUSE: HouseInputs = {
  solarW: 5840,
  capacityFactor: 0.13,
  monthlyBill: 2500,
  tariff: 4.5,
  occupancy: 0.4, // เริ่มที่โหมดอยู่กัน 2 คน
  batteryKWh: 10,
  batteryPricePerKWh: 525,
  batteryRoundTrip: 0.9,
  sellPrice: 2.2,
  evOn: true,
  evKWhPerDay: 8,
};

export interface HouseHour {
  hour: number;
  solar: number; // kW
  load: number; // kW (house + EV)
  soc: number; // 0..1
  gridImport: number; // kW
  gridExport: number; // kW
}

export interface HouseResult {
  hourly: HouseHour[];
  solarKWhDay: number;
  loadKWhDay: number;
  importKWhDay: number;
  exportKWhDay: number;
  selfConsumption: number; // 0..1 — solar used onsite / solar produced
  selfSufficiency: number; // 0..1 — load met without grid / load
  // Money
  billNoSolar: number; // ฿/mo if buying everything
  billNow: number; // ฿/mo with solar (+battery)
  monthlySaving: number; // ฿/mo vs no-solar
  batteryCost: number; // ฿
  batteryPaybackYears: number;
  // Resilience
  offGridHours: number; // how long battery alone covers night load
  co2AvoidedKgYear: number;
}

const GRID_CO2_KG_PER_KWH = 0.5; // Thailand grid factor (rough)

export function simulateHouse(i: HouseInputs): HouseResult {
  const solarKWhDay = (i.solarW / 1000) * 24 * i.capacityFactor;

  // Full-house daily kWh implied by the bill, then scaled by occupancy.
  const fullDailyKWh = i.monthlyBill / i.tariff / 30;
  const houseDailyKWh = fullDailyKWh * i.occupancy;
  const evDailyKWh = i.evOn ? i.evKWhPerDay : 0;

  // Hourly shapes (reuse provincial shapes — same physical patterns)
  const solar = SOLAR_SHAPE_24H.map((s) => s * solarKWhDay);
  const house = LIFESTYLE_SHAPE_24H.map((s) => s * houseDailyKWh);
  // EV charges midday off the solar peak (hours 10–15)
  const evShape: number[] = Array.from({ length: 24 }, (_, h) =>
    h >= 10 && h <= 15 ? 1 : 0,
  );
  const evSum = evShape.reduce((a, b) => a + b, 0);
  const ev = evShape.map((s) => (evDailyKWh * s) / evSum);

  const capKWh = i.batteryKWh;
  const sqrtRT = Math.sqrt(i.batteryRoundTrip);
  let soc = capKWh * 0.5;

  const hourly: HouseHour[] = [];
  let importKWh = 0;
  let exportKWh = 0;
  let solarUsedOnsite = 0;
  let loadFromGrid = 0;
  const totalLoad = houseDailyKWh + evDailyKWh;

  for (let h = 0; h < 24; h++) {
    const load = house[h] + ev[h];
    let s = solar[h];
    let imp = 0;
    let exp = 0;

    // Solar serves load first
    const solarToLoad = Math.min(s, load);
    s -= solarToLoad;
    let rem = load - solarToLoad;
    solarUsedOnsite += solarToLoad;

    // Surplus solar → charge battery → export
    if (s > 0) {
      const headroom = Math.max(0, capKWh - soc);
      const charge = Math.min(s, headroom / sqrtRT);
      soc += charge * sqrtRT;
      solarUsedOnsite += charge; // stored solar is still "used onsite"
      s -= charge;
      exp = s;
      exportKWh += exp;
    }

    // Remaining load → battery → grid
    if (rem > 0) {
      const avail = Math.max(0, soc);
      const fromBatt = Math.min(rem, avail * sqrtRT);
      soc -= fromBatt / sqrtRT;
      rem -= fromBatt;
      imp = rem;
      importKWh += imp;
      loadFromGrid += imp;
    }

    soc = Math.max(0, Math.min(capKWh, soc));
    hourly.push({
      hour: h,
      solar: solar[h],
      load,
      soc: capKWh > 0 ? soc / capKWh : 0,
      gridImport: imp,
      gridExport: exp,
    });
  }

  const selfConsumption = solarKWhDay > 0 ? solarUsedOnsite / solarKWhDay : 0;
  const selfSufficiency = totalLoad > 0 ? 1 - loadFromGrid / totalLoad : 1;

  // Money (monthly)
  const billNoSolar = fullDailyKWh * i.occupancy * 30 * i.tariff +
    (i.evOn ? i.evKWhPerDay * 30 * i.tariff : 0);
  const billNow = importKWh * 30 * i.tariff - exportKWh * 30 * i.sellPrice;
  const monthlySaving = billNoSolar - billNow;

  const batteryCost = capKWh * i.batteryPricePerKWh;
  const annualSaving = monthlySaving * 12;
  const batteryPaybackYears =
    capKWh > 0 && annualSaving > 0 ? batteryCost / annualSaving : 0;

  // Off-grid: how many hours can the (full) battery alone cover average night load
  const avgNightLoadKW = totalLoad / 24;
  const usableKWh = capKWh * Math.min(soc / capKWh || 1, 1);
  void usableKWh;
  const offGridHours = avgNightLoadKW > 0 ? (capKWh * sqrtRT) / avgNightLoadKW : 0;

  const co2AvoidedKgYear = Math.min(solarUsedOnsite, totalLoad) * 365 * GRID_CO2_KG_PER_KWH;

  return {
    hourly,
    solarKWhDay,
    loadKWhDay: totalLoad,
    importKWhDay: importKWh,
    exportKWhDay: exportKWh,
    selfConsumption: Math.min(1, selfConsumption),
    selfSufficiency: Math.max(0, Math.min(1, selfSufficiency)),
    billNoSolar,
    billNow,
    monthlySaving,
    batteryCost,
    batteryPaybackYears,
    offGridHours,
    co2AvoidedKgYear,
  };
}
