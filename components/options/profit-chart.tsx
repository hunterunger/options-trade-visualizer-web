"use client";

import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    ReferenceLine,
} from "recharts";
import type { ProfitPoint } from "@/types/options";

interface ProfitChartProps {
    data: ProfitPoint[];
    breakEven?: number;
    underlyingPrice?: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});

const tooltipFormatter = (value: number) => currencyFormatter.format(value);

export const ProfitChart = ({ data, breakEven, underlyingPrice }: ProfitChartProps) => {
    if (!data?.length) {
        return <div className="h-64" />;
    }

    return (
        <div className="h-72">
            <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 12, right: 24, bottom: 16, left: 0 }}>
                    <defs>
                        <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.6} />
                            <stop offset="80%" stopColor="hsl(var(--accent))" stopOpacity={0.05} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted) / 0.4)" />
                    <XAxis
                        dataKey="price"
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                        fontSize={12}
                    />
                    <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                        fontSize={12}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "hsla(var(--popover) / 0.9)",
                            borderRadius: 12,
                            borderColor: "hsl(var(--border))",
                            padding: 12,
                        }}
                        labelFormatter={(label) => `Underlying: $${Number(label).toFixed(2)}`}
                        formatter={(value: number) => [tooltipFormatter(value), "Profit"]}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                    {typeof breakEven === "number" ? (
                        <ReferenceLine
                            x={breakEven}
                            stroke="hsl(var(--highlight))"
                            strokeDasharray="3 3"
                            label={{
                                value: "Breakeven",
                                position: "top",
                                fill: "hsl(var(--highlight))",
                                fontSize: 12,
                            }}
                        />
                    ) : null}
                    {typeof underlyingPrice === "number" ? (
                        <ReferenceLine
                            x={underlyingPrice}
                            stroke="hsl(var(--accent))"
                            strokeDasharray="2 2"
                            label={{
                                value: "Spot",
                                position: "bottom",
                                fill: "hsl(var(--accent))",
                                fontSize: 11,
                            }}
                        />
                    ) : null}
                    <Area
                        type="monotone"
                        dataKey="profit"
                        strokeWidth={2}
                        stroke="hsl(var(--accent))"
                        fillOpacity={1}
                        fill="url(#profitGradient)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 1, stroke: "hsl(var(--accent))" }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
