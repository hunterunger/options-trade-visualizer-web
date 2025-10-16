"use client";

import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import type { OpenInterestPoint } from "@/types/options";

interface OpenInterestChartProps {
    data: OpenInterestPoint[];
}

const buildSeries = (points: OpenInterestPoint[]) => {
    const grouped = new Map<number, { strike: number; call?: number; put?: number }>();

    points.forEach((point) => {
        const strike = Math.round(point.strike * 100) / 100;
        if (!grouped.has(strike)) {
            grouped.set(strike, { strike });
        }
        const bucket = grouped.get(strike)!;
        if (point.type === "call") {
            bucket.call = point.openInterest;
        } else {
            bucket.put = point.openInterest;
        }
    });

    return Array.from(grouped.values()).sort((a, b) => a.strike - b.strike).slice(0, 24);
};

export const OpenInterestChart = ({ data }: OpenInterestChartProps) => {
    const series = buildSeries(data);

    return (
        <div className="h-72">
            <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 12, right: 24, left: 12, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted) / 0.3)" />
                    <XAxis
                        dataKey="strike"
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                        fontSize={12}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                        formatter={(value: number) => [value.toLocaleString(), "Contracts"]}
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
                    <Bar dataKey="call" name="Calls" fill="hsl(var(--accent))" radius={6} />
                    <Bar dataKey="put" name="Puts" fill="hsl(var(--highlight))" radius={6} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
