"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

interface SentimentPointVm {
    label: string; // e.g., Dec 27
    expiry: number; // ms
    score: number; // baseline [-1,1]
    scoreOi?: number; // OI-weighted [-1,1]
    rr25?: number | null; // IV skew
    gex?: number | null; // Dealer gamma exposure proxy
}

interface SentimentChartProps {
    title?: string;
    points: SentimentPointVm[];
}

const SentimentChart = ({ title = "Options Sentiment by Expiry", points }: SentimentChartProps) => {
    return (
        <Card className="bg-card/60 backdrop-blur">
            <CardHeader>
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
                <CardDescription className="mt-1 text-xs text-muted-foreground">
                    Each point summarizes call-vs-put mark premiums around ATM for that expiry. Green: baseline. Amber: OI-weighted.
                </CardDescription>
            </CardHeader>
            <CardContent className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={0} height={28} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} width={32} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} width={40} />
                        <Tooltip
                            formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
                            labelFormatter={(l) => `Expiry: ${l}`}
                        />
                        <ReferenceLine y={0} yAxisId="left" stroke="#8884d8" strokeDasharray="3 3" />
                        <Legend verticalAlign="top" height={24} />
                        <Line yAxisId="left" name="Baseline" type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                        <Line yAxisId="left" name="OI-weighted" type="monotone" dataKey="scoreOi" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                        <Line yAxisId="left" name="RR25 (IV skew)" type="monotone" dataKey="rr25" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} />
                        <Line yAxisId="right" name="Dealer GEX" type="monotone" dataKey="gex" stroke="#a78bfa" strokeWidth={2} dot={{ r: 2 }} />
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
                        <span className="font-medium text-foreground">OI‑weighted (amber):</span> same as Baseline but boosted by open interest per strike with
                        <span className="font-mono"> 1 + log10(1 + OI_call + OI_put)</span> to favor liquid levels.
                    </li>
                    <li>
                        <span className="font-medium text-foreground">RR25 (teal):</span> IV skew using ~25‑delta options. We pick the call and put with deltas closest to +0.25 and −0.25 respectively and plot
                        <span className="font-mono"> IV_call,25D − IV_put,25D</span> (using <span className="font-mono">markIV</span> or bid/ask IVs).
                    </li>
                    <li>
                        <span className="font-medium text-foreground">Dealer GEX (purple):</span> proxy for aggregate dealer gamma exposure: sum over <span className="font-mono">gamma × OI × unit</span>
                        (scaled by <span className="font-mono">S²</span> for stability). Positive often supports mean‑reversion; negative can accompany trendiness.
                    </li>
                </ul>
                <p className="mt-3">
                    Tip: compare how the lines agree or diverge across expiries. Alignment across Baseline, OI‑weighted, and RR25 usually indicates stronger conviction.
                </p>
            </CardContent>
        </Card>
    );
};

export default SentimentChart;
