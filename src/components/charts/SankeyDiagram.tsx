import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { GlassTooltip } from "@/components/charts/ChartTooltip";
import { computeDemandSizes } from "@/engine/simulate";
import { CF_BY_SEASON } from "@/data/constants";
import type { HourlyPoint, SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
  hourly: HourlyPoint[];
}

interface SNode {
  name: string;
  color: string;
  group: "source" | "mission" | "output";
}

interface SLink {
  source: number;
  target: number;
  value: number;
}

export function SankeyDiagram({ inputs, hourly }: Props) {
  // ---------- Daily production by source (GWh/day) ----------
  const cf = CF_BY_SEASON[inputs.season];
  const solar = (inputs.solarMW * 24 * cf.solar) / 1000;
  const wind = (inputs.windMW * 24 * cf.wind) / 1000;
  const biomass = (inputs.biomassMW * 24 * cf.biomass) / 1000;
  const hydro = (inputs.hydroMW * 24 * cf.hydro) / 1000;
  const totalSupply = solar + wind + biomass + hydro || 1; // avoid /0

  // ---------- Daily demand by mission (GWh/day) ----------
  const d = computeDemandSizes(inputs);

  // Battery export/import detection — small effective adjustment
  const totalDemand =
    d.lifestyle + d.dac + d.methanol + d.dataCenter + d.desal + d.waste + d.wwt;

  // Each mission gets supply allocated proportional to share of total demand
  // (approximation — a real grid mix can be more nuanced)
  const supplyShare = {
    solar: solar / totalSupply,
    wind: wind / totalSupply,
    biomass: biomass / totalSupply,
    hydro: hydro / totalSupply,
  };

  // ---------- Build node list ----------
  const nodes: SNode[] = [
    // 0..3 — Sources
    { name: "Solar", color: "oklch(0.83 0.17 75)", group: "source" },
    { name: "Wind", color: "oklch(0.78 0.14 235)", group: "source" },
    { name: "Biomass", color: "oklch(0.78 0.18 155)", group: "source" },
    { name: "Hydro", color: "oklch(0.72 0.15 200)", group: "source" },
    // 4..10 — Missions
    { name: "Lifestyle/EV", color: "oklch(0.96 0.005 270)", group: "mission" },
    { name: "DAC", color: "oklch(0.78 0.18 155)", group: "mission" },
    { name: "E-Methanol", color: "oklch(0.7 0.2 290)", group: "mission" },
    { name: "Data Center", color: "oklch(0.78 0.14 235)", group: "mission" },
    { name: "Desalination", color: "oklch(0.72 0.15 200)", group: "mission" },
    { name: "Plasma Waste", color: "oklch(0.83 0.17 75)", group: "mission" },
    { name: "Wastewater", color: "oklch(0.7 0.15 240)", group: "mission" },
    // 11.. — Outputs
    { name: "Powered city", color: "oklch(0.96 0.005 270)", group: "output" },
    { name: "CO₂ captured", color: "oklch(0.78 0.18 155)", group: "output" },
    { name: "Methanol fuel", color: "oklch(0.7 0.2 290)", group: "output" },
    { name: "Compute / IT", color: "oklch(0.78 0.14 235)", group: "output" },
    { name: "Fresh water", color: "oklch(0.72 0.15 200)", group: "output" },
    { name: "Slag + biogas", color: "oklch(0.83 0.17 75)", group: "output" },
    { name: "Clean effluent", color: "oklch(0.7 0.15 240)", group: "output" },
  ];

  const missionDemands: [number, number][] = [
    [4, d.lifestyle],
    [5, d.dac],
    [6, d.methanol],
    [7, d.dataCenter],
    [8, d.desal],
    [9, d.waste],
    [10, d.wwt],
  ].filter(([, v]) => v > 0.001) as [number, number][];

  const links: SLink[] = [];

  // Source → Mission (proportional to source share of supply)
  for (const [missionIdx, demand] of missionDemands) {
    for (const [sourceIdx, share] of [
      [0, supplyShare.solar],
      [1, supplyShare.wind],
      [2, supplyShare.biomass],
      [3, supplyShare.hydro],
    ] as [number, number][]) {
      const v = demand * share;
      if (v > 0.001) {
        links.push({ source: sourceIdx, target: missionIdx, value: +v.toFixed(3) });
      }
    }
  }

  // Mission → Output (1:1 mapping)
  const missionToOutput: Record<number, number> = {
    4: 11, // Lifestyle → Powered city
    5: 12, // DAC → CO2 captured
    6: 13, // Methanol → Methanol fuel
    7: 14, // DC → Compute
    8: 15, // Desal → Fresh water
    9: 16, // Plasma → Slag
    10: 17, // WWT → Clean effluent
  };
  for (const [missionIdx, demand] of missionDemands) {
    const outputIdx = missionToOutput[missionIdx];
    if (outputIdx !== undefined) {
      links.push({ source: missionIdx, target: outputIdx, value: +demand.toFixed(3) });
    }
  }

  // Trim nodes/links so only ones that participate stay
  const usedNodeIdx = new Set<number>();
  links.forEach((l) => {
    usedNodeIdx.add(l.source);
    usedNodeIdx.add(l.target);
  });
  const oldToNew = new Map<number, number>();
  const sankeyNodes = nodes
    .map((n, i) => ({ ...n, _old: i }))
    .filter((n) => usedNodeIdx.has(n._old))
    .map((n, newIdx) => {
      oldToNew.set(n._old, newIdx);
      return { name: n.name, color: n.color };
    });
  const sankeyLinks = links.map((l) => ({
    source: oldToNew.get(l.source)!,
    target: oldToNew.get(l.target)!,
    value: l.value,
  }));

  // Quick stat for legend
  const supplyAvg = hourly.length > 0
    ? hourly.reduce((a, h) => a + h.totalSupply, 0) / hourly.length
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Energy flow (daily)</CardTitle>
            <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
              Source → Mission → Output · widths proportional to GWh/day
            </p>
          </div>
          <div className="flex gap-1.5">
            <Badge tone="amber">Sources</Badge>
            <Badge tone="violet">Missions</Badge>
            <Badge tone="emerald">Outputs</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[480px] w-full">
          {sankeyLinks.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-[var(--color-fg-muted)]">
              No flow — enable at least one demand module
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <Sankey
                data={{ nodes: sankeyNodes, links: sankeyLinks }}
                nodePadding={26}
                nodeWidth={12}
                linkCurvature={0.55}
                iterations={64}
                margin={{ top: 10, right: 100, left: 10, bottom: 10 }}
                node={<SankeyNode />}
                link={{ stroke: "oklch(0.96 0.005 270 / 0.12)" }}
              >
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0].payload as {
                      name?: string;
                      value?: number;
                      source?: { name: string };
                      target?: { name: string };
                    };
                    if (p.source && p.target) {
                      return (
                        <GlassTooltip title={`${p.source.name} → ${p.target.name}`}>
                          <p className="tabular text-sm font-medium text-[var(--color-fg)]">
                            {p.value?.toFixed(2)} GWh/day
                          </p>
                        </GlassTooltip>
                      );
                    }
                    return (
                      <GlassTooltip>
                        <p className="text-sm font-medium text-[var(--color-fg)]">
                          {p.name}
                        </p>
                      </GlassTooltip>
                    );
                  }}
                />
              </Sankey>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--color-fg-subtle)]">
          <span>
            Daily supply ≈{" "}
            <span className="tabular font-medium text-[var(--color-fg-muted)]">
              {(supplyAvg * 24 / 1000).toFixed(2)} GWh
            </span>
          </span>
          <span>
            Total demand:{" "}
            <span className="tabular font-medium text-[var(--color-fg-muted)]">
              {totalDemand.toFixed(2)} GWh/day
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// Custom node renderer — colored bar with name+value label
function SankeyNode(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: {
    name: string;
    color?: string;
    value: number;
    sourceLinks?: unknown[];
    targetLinks?: unknown[];
  };
  containerWidth?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload, containerWidth = 0 } = props;
  if (!payload) return null;
  const isRight = x > containerWidth - 120;
  const color = payload.color ?? "oklch(0.7 0.01 270)";

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.85}
        rx={3}
      />
      <text
        x={isRight ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isRight ? "end" : "start"}
        dominantBaseline="middle"
        className="tabular"
        fill="var(--color-fg)"
        fontSize={11}
        fontWeight={500}
      >
        {payload.name}
      </text>
      <text
        x={isRight ? x - 8 : x + width + 8}
        y={y + height / 2 + 14}
        textAnchor={isRight ? "end" : "start"}
        dominantBaseline="middle"
        className="tabular"
        fill="var(--color-fg-subtle)"
        fontSize={9}
      >
        {payload.value.toFixed(1)} GWh
      </text>
    </g>
  );
}
