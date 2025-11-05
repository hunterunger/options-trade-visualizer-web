"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SnapshotTimelinePoint {
    createdAt: number;
    label: string;
    iso: string;
    price: number | null;
    baseline: number | null;
    rr25: number | null;
    forwardReturn: number | null;
    sentimentAlignment: number | null;
    futureTimestamp: string | null;
}

interface PriceTimelineChartProps {
    points: SnapshotTimelinePoint[];
    selectedTimestamp: number | null;
    underlying: string;
    expiry: number;
    horizonLabel: string;
}

const PriceTimelineChart = ({ points, selectedTimestamp, underlying, expiry, horizonLabel }: PriceTimelineChartProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const sortedPoints = useMemo(() => [...points].sort((a, b) => a.createdAt - b.createdAt), [points]);
    const selectedPoint = selectedTimestamp ? sortedPoints.find((p) => p.createdAt === selectedTimestamp) ?? null : null;

    const priceValues = useMemo(() => {
        const values = sortedPoints
            .map((p) => (typeof p.price === "number" && Number.isFinite(p.price) ? p.price : null))
            .filter((v): v is number => v != null);
        if (!values.length) return undefined;
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (min === max) {
            const basis = Math.abs(min);
            const padding = basis >= 1 ? basis * 0.01 : 1;
            return [min - padding, max + padding] as [number, number];
        }
        const span = max - min;
        const pad = span * 0.08;
        return [min - pad, max + pad] as [number, number];
    }, [sortedPoints]);

    const sentimentDomain = useMemo(() => {
        const values = sortedPoints.flatMap((p) => [p.baseline, p.rr25, p.sentimentAlignment, p.forwardReturn]).filter(
            (value): value is number => value != null && Number.isFinite(value)
        );
        if (!values.length) return [-1, 1] as [number, number];
        const min = Math.min(-1, ...values);
        const max = Math.max(1, ...values);
        return [min, max] as [number, number];
    }, [sortedPoints]);

    const handleNavigate = useCallback(
        (timestamp: number | null) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("underlying", underlying);
            params.set("expiry", String(expiry));
            if (timestamp) {
                params.set("snapshot", String(timestamp));
            } else {
                params.delete("snapshot");
            }
            const next = `${pathname}?${params.toString()}`;
            router.push(next, { scroll: false });
        },
        [expiry, pathname, router, searchParams, underlying]
    );

    const handleChartClick = useCallback(
        (state: unknown) => {
            const payload = (state as { activePayload?: Array<{ payload?: SnapshotTimelinePoint }> })?.activePayload?.[0]?.payload;
            if (!payload) return;
            handleNavigate(payload.createdAt);
        },
        [handleNavigate]
    );

    const latestTimestamp = sortedPoints.at(-1)?.createdAt ?? null;
    const isLatestSelected = !selectedTimestamp || selectedTimestamp === latestTimestamp;

    return (
        <Card className="bg-card/60 backdrop-blur">
            <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base font-semibold">Snapshot Price Timeline</CardTitle>
                        <CardDescription className="mt-1 text-xs text-muted-foreground">
                            Compare stored snapshots through time: baseline sentiment (green), 25Δ risk reversal (teal), index price (slate), and how well sentiment direction lined up with the {horizonLabel.toLowerCase()} move (violet). Forward returns (amber) highlight the price change measured on that same horizon.
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn("self-start border-dashed", isLatestSelected ? "opacity-60" : "")}
                        disabled={isLatestSelected}
                        onClick={() => handleNavigate(latestTimestamp)}
                    >
                        Jump to latest snapshot
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="h-[420px] w-full sm:h-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sortedPoints} margin={{ top: 8, right: 16, bottom: 12, left: 0 }} onClick={handleChartClick}>
                        <XAxis
                            dataKey="iso"
                            tickFormatter={(iso) =>
                                new Date(iso).toLocaleTimeString(undefined, {
                                    month: "short",
                                    day: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })
                            }
                            tick={{ fontSize: 11 }}
                            interval={sortedPoints.length > 12 ? Math.ceil(sortedPoints.length / 12) : 0}
                            height={42}
                            minTickGap={18}
                        />
                        <YAxis yAxisId="sentiment" domain={sentimentDomain} tick={{ fontSize: 12 }} width={36} />
                        <YAxis
                            yAxisId="price"
                            orientation="right"
                            domain={priceValues ?? ["auto", "auto"]}
                            tick={{ fontSize: 12 }}
                            width={52}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        />
                        <Tooltip
                            labelFormatter={(iso) => new Date(iso as string).toLocaleString()}
                            formatter={(value, key, payload) => {
                                if (typeof value !== "number") return value as string;
                                switch (key) {
                                    case "price":
                                        return [value.toLocaleString(undefined, { maximumFractionDigits: 0 }), "Index Price"];
                                    case "baseline":
                                        return [(value * 100).toFixed(2) + "%", "Baseline"];
                                    case "rr25":
                                        return [(value * 100).toFixed(2) + "%", "RR25"];
                                    case "forwardReturn":
                                        return [(value * 100).toFixed(2) + "%", `Forward Return (${horizonLabel})`];
                                    case "sentimentAlignment": {
                                        const point = payload.payload as SnapshotTimelinePoint;
                                        const futureLabel = point.futureTimestamp
                                            ? new Date(point.futureTimestamp).toLocaleString(undefined, {
                                                month: "short",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })
                                            : horizonLabel;
                                        return [(value * 100).toFixed(1) + "%", `Sentiment Accuracy (${futureLabel})`];
                                    }
                                    default:
                                        return [(value * 100).toFixed(2) + "%", key];
                                }
                            }}
                        />
                        <ReferenceLine yAxisId="sentiment" y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                        {selectedPoint ? (
                            <ReferenceLine x={selectedPoint.iso} yAxisId="sentiment" stroke="#22c55e" strokeDasharray="6 4" />
                        ) : null}
                        <Line type="linear" yAxisId="sentiment" dataKey="baseline" stroke="#22c55e" dot={{ r: 2 }} strokeWidth={2} connectNulls />
                        <Line type="linear" yAxisId="sentiment" dataKey="rr25" stroke="#0ea5e9" dot={{ r: 2 }} strokeWidth={2} connectNulls />
                        <Line
                            type="linear"
                            yAxisId="sentiment"
                            dataKey="sentimentAlignment"
                            stroke="#a855f7"
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            connectNulls
                        />
                        <Line
                            type="linear"
                            yAxisId="sentiment"
                            dataKey="forwardReturn"
                            stroke="#f97316"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            dot={false}
                            connectNulls
                        />
                        <Line type="linear" yAxisId="price" dataKey="price" stroke="#64748b" strokeWidth={2} dot={{ r: 1.8 }} connectNulls />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
            <CardContent className="pt-2 text-sm leading-relaxed text-muted-foreground">
                <p>
                    Selecting a timestamp rewrites the <span className="font-mono">snapshot</span> query parameter so the rest of the dashboard rehydrates with that capture. The latest capture remains one click away if you want to jump back to live context.
                </p>
                <p className="mt-2 text-xs text-muted-foreground/80">
                    Sentiment accuracy and forward returns are computed using the {horizonLabel.toLowerCase()} horizon you pick above. Shift the horizon to test whether the signal leads the market over different intervals or all the way to expiry.
                </p>
                {sortedPoints.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground/80">No snapshot history yet. Once captures populate Firestore, they will appear here automatically.</p>
                ) : null}
            </CardContent>
        </Card>
    );
};

export default PriceTimelineChart;
