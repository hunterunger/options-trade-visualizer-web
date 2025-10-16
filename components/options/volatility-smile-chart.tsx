"use client";

import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { VolatilitySmilePoint } from "@/types/options";

interface VolatilitySmileChartProps {
    data: VolatilitySmilePoint[];
    realizedVolatility?: number;
}

const buildSeries = (points: VolatilitySmilePoint[]) => {
    const grouped = new Map<number, { strike: number; call?: number; put?: number }>();

    points.forEach((point) => {
        const strike = Math.round(point.strike * 100) / 100;
        if (!grouped.has(strike)) {
            grouped.set(strike, { strike });
        }
        const bucket = grouped.get(strike)!;
        if (point.type === "call") {
            bucket.call = point.impliedVolatility * 100;
        } else {
            bucket.put = point.impliedVolatility * 100;
        }
    });

    return Array.from(grouped.values()).sort((a, b) => a.strike - b.strike);
};

const percentFormatter = (value: number) => `${value.toFixed(2)}%`;

type TooltipValue = number;
type TooltipLabel = string;

const tooltipFormatter: TooltipProps<TooltipValue, TooltipLabel>["formatter"] = (
    value,
    name,
    payload,
) => {
    if (typeof value !== "number") {
        return [value ?? "", name ?? ""];
    }

    const dataKey = payload?.dataKey;
    const resolvedLabel = dataKey === "rv" ? "Realized Vol" : name ?? "";

    return [`${value.toFixed(2)}%`, resolvedLabel];
};

export const VolatilitySmileChart = ({ data, realizedVolatility }: VolatilitySmileChartProps) => {
    const baseSeries = buildSeries(data);
    const realizedPercent = typeof realizedVolatility === "number" ? realizedVolatility * 100 : undefined;
    const series = realizedPercent !== undefined
        ? baseSeries.map((point) => ({ ...point, rv: realizedPercent }))
        : baseSeries;

    return (
        <div className="h-72">
            <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 12, right: 24, left: 12, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted) / 0.35)" />
                    <XAxis
                        dataKey="strike"
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                        fontSize={12}
                    />
                    <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={percentFormatter}
                        fontSize={12}
                    />
                    <Tooltip
                        formatter={tooltipFormatter}
                        labelFormatter={(label) => `Strike $${label}`}
                        contentStyle={{
                            backgroundColor: "hsla(var(--popover) / 0.93)",
                            borderColor: "hsl(var(--border))",
                            borderRadius: 12,
                            padding: 12,
                        }}
                    />
                    <Legend
                        formatter={(value) => (
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">{value}</span>
                        )}
                    />
                    <Line
                        type="monotone"
                        dataKey="call"
                        stroke="hsl(var(--accent))"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--accent))" }}
                        name="Calls"
                    />
                    <Line
                        type="monotone"
                        dataKey="put"
                        stroke="hsl(var(--highlight))"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--highlight))" }}
                        name="Puts"
                    />
                    {realizedPercent !== undefined ? (
                        <Line
                            type="monotone"
                            dataKey="rv"
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="4 4"
                            strokeWidth={2}
                            dot={false}
                            name="Realized Vol"
                        />
                    ) : null}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};
