"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

interface SentimentPointVm {
    label: string; // e.g., Dec 27
    expiry: number; // ms
    score?: number | null; // baseline [-1,1]
    scoreOi?: number | null; // OI-weighted [-1,1]
    rr25?: number | null; // IV skew
    scoreLive?: number;
    scoreOiLive?: number;
    rr25Live?: number | null;
    priceSnapshot?: number | null;
    priceLive?: number | null;
}

interface SentimentChartProps {
    title?: string;
    points: SentimentPointVm[];
}

const SentimentChart = ({ title = "Options Sentiment by Expiry", points }: SentimentChartProps) => {
    const hasSnapshotBaseline = points.some((p) => typeof p.score === "number" && p.score !== null);
    const hasLiveBaseline = points.some((p) => typeof p.scoreLive === "number");
    const hasSnapshotOi = points.some((p) => typeof p.scoreOi === "number" && p.scoreOi !== null);
    const hasLiveOi = points.some((p) => typeof p.scoreOiLive === "number");
    const hasSnapshotRr = points.some((p) => p.rr25 != null);
    const hasLiveRr = points.some((p) => p.rr25Live != null);
    const hasSnapshotPrice = points.some((p) => p.priceSnapshot != null);
    const hasLivePrice = points.some((p) => p.priceLive != null);

    const priceValues = points.flatMap((p) => {
        const vals: number[] = [];
        if (typeof p.priceSnapshot === "number" && Number.isFinite(p.priceSnapshot)) vals.push(p.priceSnapshot);
        if (typeof p.priceLive === "number" && Number.isFinite(p.priceLive)) vals.push(p.priceLive);
        return vals;
    });

    const priceDomain: [number, number] | undefined = priceValues.length
        ? (() => {
            const min = Math.min(...priceValues);
            const max = Math.max(...priceValues);
            if (min === max) {
                const basis = Math.abs(min);
                const pad = basis >= 1 ? basis * 0.01 : 1;
                return [min - pad, max + pad] as [number, number];
            }
            const span = max - min;
            const pad = span * 0.08;
            return [min - pad, max + pad] as [number, number];
        })()
        : undefined;

    return (
        <Card className="bg-card/60 backdrop-blur">
            <CardHeader>
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
                <CardDescription className="mt-1 text-xs text-muted-foreground">
                    Solid lines = stored snapshot, dashed = live overlay. Baseline/OI/Skew share the left axis, Dealer GEX the purple axis, and index price rides the slate axis so you can compare spot moves vs positioning.
                </CardDescription>
            </CardHeader>
            <CardContent className="h-[420px] w-full sm:h-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={0} height={28} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} width={32} domain={[-1, 1]} allowDataOverflow />
                        <YAxis
                            yAxisId="price"
                            orientation="right"
                            tick={{ fontSize: 12 }}
                            width={54}
                            axisLine={false}
                            tickLine={false}
                            domain={priceDomain ?? ["auto", "auto"]}
                            tickFormatter={(v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        />
                        <Tooltip
                            formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
                            labelFormatter={(l) => `Expiry: ${l}`}
                        />
                        <ReferenceLine y={0} yAxisId="left" stroke="#8884d8" strokeDasharray="3 3" />
                        <Legend verticalAlign="top" height={24} />
                        {hasSnapshotBaseline ? (
                            <Line yAxisId="left" name="Baseline (snapshot)" type="linear" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                        ) : null}
                        {hasLiveBaseline ? (
                            <Line
                                yAxisId="left"
                                name="Baseline (live)"
                                type="linear"
                                dataKey="scoreLive"
                                stroke="#16a34a"
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                dot={false}
                            />
                        ) : null}
                        {hasSnapshotOi ? (
                            <Line yAxisId="left" name="OI-weighted (snapshot)" type="linear" dataKey="scoreOi" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                        ) : null}
                        {hasLiveOi ? (
                            <Line
                                yAxisId="left"
                                name="OI-weighted (live)"
                                type="linear"
                                dataKey="scoreOiLive"
                                stroke="#d97706"
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                dot={false}
                            />
                        ) : null}
                        {hasSnapshotRr ? (
                            <Line yAxisId="left" name="RR25 (snapshot)" type="linear" dataKey="rr25" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} />
                        ) : null}
                        {hasLiveRr ? (
                            <Line
                                yAxisId="left"
                                name="RR25 (live)"
                                type="linear"
                                dataKey="rr25Live"
                                stroke="#0ea5e9"
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                dot={false}
                            />
                        ) : null}
                        {hasSnapshotPrice ? (
                            <Line
                                yAxisId="price"
                                name="Index Price (snapshot)"
                                type="linear"
                                dataKey="priceSnapshot"
                                stroke="#64748b"
                                strokeWidth={2}
                                dot={{ r: 2 }}
                            />
                        ) : null}
                        {hasLivePrice ? (
                            <Line
                                yAxisId="price"
                                name="Index Price (live)"
                                type="linear"
                                dataKey="priceLive"
                                stroke="#0f172a"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                dot={false}
                            />
                        ) : null}
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
            <CardContent className="pt-2 text-sm leading-relaxed text-muted-foreground">
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <span className="font-medium text-foreground">Baseline (green):</span> per strike, compare Call vs Put <span className="font-mono">mark</span> at the same strike. Compute
                        <span className="font-mono"> (call/(call+put)) − (put/(call+put))</span> and weight near‑ATM more with <span className="font-mono">w = exp(−β · |ln(K/S)|)</span> (β≈6). Aggregate to one score in [-1, 1].
                    </li>
                    <li>
                        <span className="font-medium text-foreground">Baseline (green):</span> compare call vs put <span className="font-mono">mark</span> at each strike, weigh near-ATM more, aggregate to [-1, 1]. Solid = snapshot, dashed = live.
                    </li>
                    <li>
                        <span className="font-medium text-foreground">OI‑weighted (amber):</span> same formula but scaled by open interest. Live overlay uses current OI levels from Binance.
                    </li>
                    <li>
                        <span className="font-medium text-foreground">RR25 (teal):</span> 25‑delta risk reversal using IVs from the matching marks. Handy for skew direction.
                    </li>
                    <li>
                        <span className="font-medium text-foreground">Index price (slate):</span> underlying spot reference so you can visually line up price inflections with GEX/sentiment shifts.
                    </li>
                </ul>
                <p className="mt-3">
                    Tip: when live (dashed) lines diverge sharply from stored snapshots, it highlights fresh shifts in positioning since the last cron capture. Watch how those shifts line up with the slate price trace.
                </p>
            </CardContent>
        </Card>
    );
};

export default SentimentChart;
