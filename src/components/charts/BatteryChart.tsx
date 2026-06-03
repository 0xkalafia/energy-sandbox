import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useChartTheme, SERIES } from "@/lib/chartTheme";
import { GlassTooltip } from "@/components/charts/ChartTooltip";
import type { HourlyPoint, SimInputs } from "@/data/types";

interface Props {
  hourly: HourlyPoint[];
  inputs: SimInputs;
}

export function BatteryChart({ hourly, inputs }: Props) {
  const theme = useChartTheme();
  const data = hourly.map((h) => ({
    hour: `${h.hour.toString().padStart(2, "0")}:00`,
    SoC: +(h.batterySoC * 100).toFixed(1),
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>State of Charge</CardTitle>
            <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
              SoC of {inputs.batteryGWh.toFixed(1)} GWh battery (%)
            </p>
          </div>
          <Badge tone="violet">{inputs.batteryGWh.toFixed(1)} GWh</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="grad-soc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES.battery} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={SERIES.battery} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid {...theme.gridProps} />
              <XAxis dataKey="hour" {...theme.axisProps} />
              <YAxis
                {...theme.axisProps}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <GlassTooltip title={label}>
                      <p className="tabular text-sm font-medium text-[var(--color-fg)]">
                        {payload[0].value}%
                      </p>
                    </GlassTooltip>
                  );
                }}
              />
              <ReferenceLine
                y={inputs.batteryDoDFloor * 100}
                stroke={SERIES.rose}
                strokeDasharray="3 3"
                label={{
                  value: `floor ${(inputs.batteryDoDFloor * 100).toFixed(0)}%`,
                  position: "insideTopRight",
                  fill: SERIES.rose,
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="SoC"
                stroke={SERIES.battery}
                fill="url(#grad-soc)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
