import UnderlyingSelect from "@/components/options/underlying-select";
import ExpiryTimeHint from "@/components/options/expiry-time-hint";
import {
    getLatestSnapshotAggregate,
    getLatestSnapshotForUnderlying,
    getSnapshotAggregateAt,
    getSnapshotForUnderlyingAt,
    listSnapshotAggregates,
    listSnapshotsForUnderlying,
    type OptionSnapshotAggregateDoc,
    type OptionSnapshotDoc,
} from "@/lib/repositories/option-snapshots";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Suspense, lazy } from "react";
import {
    buildContractGrid,
    fetchAllMarkPrices,
    fetchExchangeInfo,
    fetchIndexPrice,
    uniqueExpiriesForUnderlying,
    type MarkPriceEntry,
    computeSentimentForExpiry,
    formatExpiryToYyMmDd,
    fetchOpenInterest,
    computeRR25ForExpiry,
} from "@/lib/services/binance";

const PriceTimelineChart = lazy(() => import("@/components/options/price-timeline-chart"));
const SentimentChart = lazy(() => import("@/components/options/sentiment-chart"));

interface PageProps {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const TIMELINE_WINDOWS = [
    { value: "1d", label: "1D", lookbackMs: 24 * 60 * 60 * 1000 },
    { value: "3d", label: "3D", lookbackMs: 3 * 24 * 60 * 60 * 1000 },
    { value: "5d", label: "5D", lookbackMs: 5 * 24 * 60 * 60 * 1000 },
    { value: "14d", label: "14D", lookbackMs: 14 * 24 * 60 * 60 * 1000 },
];

const TIMELINE_RESOLUTIONS = [
    { value: "15m", label: "15m", stepMs: 15 * 60 * 1000 },
    { value: "30m", label: "30m", stepMs: 30 * 60 * 1000 },
    { value: "1h", label: "1h", stepMs: 60 * 60 * 1000 },
    { value: "4h", label: "4h", stepMs: 4 * 60 * 60 * 1000 },
];

type TimelineHorizonOption =
    | { value: string; label: string; type: "expiry" }
    | { value: string; label: string; type: "next" }
    | { value: string; label: string; type: "duration"; durationMs: number };

const TIMELINE_HORIZONS: TimelineHorizonOption[] = [
    { value: "expiry", label: "To expiry", type: "expiry" },
    { value: "next", label: "Next capture", type: "next" },
    { value: "6h", label: "6h", type: "duration", durationMs: 6 * 60 * 60 * 1000 },
    { value: "1d", label: "1d", type: "duration", durationMs: 24 * 60 * 60 * 1000 },
    { value: "3d", label: "3d", type: "duration", durationMs: 3 * 24 * 60 * 60 * 1000 },
];

const toStringParam = (v: string | string[] | undefined, fallback: string) =>
    Array.isArray(v) ? v[0] ?? fallback : v ?? fallback;

const toNum = (v: unknown): number | undefined => {
    if (v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

const formatPercent = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    const pct = value * 100;
    return `${pct.toFixed(1)}%`;
};

const formatVolPoints = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    return `${(value * 100).toFixed(2)} vol`;
};

const formatPriceValue = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return value.toLocaleString(undefined, { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits });
};

const formatPriceChange = (value: number) => {
    const abs = Math.abs(value);
    const fractionDigits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return `${abs.toLocaleString(undefined, { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits })}`;
};

const formatNotional = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
    return `${sign}${abs.toFixed(0)}`;
};

type DeltaTone = "positive" | "negative" | "muted";

const buildDelta = (
    live: number | null | undefined,
    snapshot: number | null | undefined,
    formatter: (abs: number) => string,
    epsilon = 1e-6
): { text: string; tone: DeltaTone } => {
    if (live == null || snapshot == null || Number.isNaN(live) || Number.isNaN(snapshot)) {
        return { text: "—", tone: "muted" };
    }
    const diff = live - snapshot;
    if (!Number.isFinite(diff) || Math.abs(diff) < epsilon) {
        return { text: "0", tone: "muted" };
    }
    const abs = Math.abs(diff);
    const prefix = diff > 0 ? "+" : "-";
    return { text: `${prefix}${formatter(abs)}`, tone: diff > 0 ? "positive" : "negative" };
};

const toneClass: Record<DeltaTone, string> = {
    positive: "text-emerald-500",
    negative: "text-rose-500",
    muted: "text-muted-foreground",
};

interface TimelineEntryLike {
    createdAt: number;
}

const constrainTimeline = <T extends TimelineEntryLike>(
    entries: T[],
    selectedTimestamp: number | null,
    lookbackMs: number,
    resolutionMs: number
): T[] => {
    if (!entries.length) return entries;
    const now = Date.now();
    const filtered = entries.filter((entry) => now - entry.createdAt <= lookbackMs);
    if (selectedTimestamp != null && !filtered.some((entry) => entry.createdAt === selectedTimestamp)) {
        const selectedEntry = entries.find((entry) => entry.createdAt === selectedTimestamp);
        if (selectedEntry) {
            filtered.push(selectedEntry);
        }
    }
    filtered.sort((a, b) => a.createdAt - b.createdAt);
    if (filtered.length <= 1) return filtered;

    const buckets = new Map<number, T>();
    for (const entry of filtered) {
        const bucket = Math.floor(entry.createdAt / resolutionMs) * resolutionMs;
        const existing = buckets.get(bucket);
        if (!existing || entry.createdAt > existing.createdAt) {
            buckets.set(bucket, entry);
        }
    }

    return Array.from(buckets.values()).sort((a, b) => a.createdAt - b.createdAt);
};

const ChartSkeleton = ({ title }: { title: string }) => (
    <Card className="bg-card/60 backdrop-blur">
        <CardHeader>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription className="mt-1 text-xs text-muted-foreground">Preparing data…</CardDescription>
        </CardHeader>
        <CardContent>
            <Skeleton className="h-[420px] w-full sm:h-[480px]" />
        </CardContent>
    </Card>
);

export default async function CryptoStats({ searchParams }: PageProps) {
    const params = (await searchParams) ?? {};
    const underlying = toStringParam(params.underlying, "BTCUSDT");
    const snapshotParamRaw = params.snapshot;
    const requestedSnapshotTs = toNum(Array.isArray(snapshotParamRaw) ? snapshotParamRaw[0] : snapshotParamRaw);
    const expiryParamRaw = params.expiry;
    const requestedExpiryValue = toNum(Array.isArray(expiryParamRaw) ? expiryParamRaw[0] : expiryParamRaw);
    const timelineWindowParam = toStringParam(params.timelineWindow, TIMELINE_WINDOWS[2]!.value);
    const timelineResolutionParam = toStringParam(params.timelineResolution, TIMELINE_RESOLUTIONS[2]!.value);
    const timelineHorizonParam = toStringParam(params.timelineHorizon, TIMELINE_HORIZONS[0]!.value);

    const selectedTimelineWindow =
        TIMELINE_WINDOWS.find((option) => option.value === timelineWindowParam) ?? TIMELINE_WINDOWS[2]!;
    const selectedTimelineResolution =
        TIMELINE_RESOLUTIONS.find((option) => option.value === timelineResolutionParam) ?? TIMELINE_RESOLUTIONS[2]!;
    const selectedTimelineHorizon =
        TIMELINE_HORIZONS.find((option) => option.value === timelineHorizonParam) ?? TIMELINE_HORIZONS[0]!;

    const timelineFetchLimit = Math.min(
        2000,
        Math.max(
            120,
            Math.ceil(selectedTimelineWindow.lookbackMs / selectedTimelineResolution.stepMs) * 3
        )
    );

    const requestStart = Date.now();
    const requestTag = `[crypto-stats:${underlying}]`;
    const logStep = (message: string) => {
        const elapsed = Date.now() - requestStart;
        console.info(`${requestTag} ${message} (${elapsed}ms)`);
    };

    logStep("start processing request");

    const { symbols } = await fetchExchangeInfo();
    logStep(`fetched exchange info (symbols=${symbols.length})`);
    const underlyings = Array.from(new Set(symbols.map((s) => s.underlying))).sort();

    const aggregateHistoryDesc = await listSnapshotAggregates(underlying, timelineFetchLimit);
    logStep(`loaded snapshot aggregates (entries=${aggregateHistoryDesc.length})`);

    let latestAggregate: OptionSnapshotAggregateDoc | null = aggregateHistoryDesc[0] ?? null;
    if (!latestAggregate) {
        latestAggregate = await getLatestSnapshotAggregate(underlying);
        logStep(`fetched latest aggregate fallback (${latestAggregate ? "hit" : "miss"})`);
    }

    let requestedAggregate: OptionSnapshotAggregateDoc | null = null;
    if (requestedSnapshotTs) {
        requestedAggregate =
            aggregateHistoryDesc.find((entry) => entry.createdAt === requestedSnapshotTs) ??
            (latestAggregate && latestAggregate.createdAt === requestedSnapshotTs ? latestAggregate : null);
        if (!requestedAggregate) {
            requestedAggregate = await getSnapshotAggregateAt(underlying, requestedSnapshotTs);
            if (requestedAggregate) {
                logStep(
                    `fetched requested aggregate hit (${new Date(requestedSnapshotTs).toISOString()})`
                );
            }
        }
    }

    const selectedAggregate = requestedAggregate ?? latestAggregate ?? null;

    const aggregateHistoryAsc = [...aggregateHistoryDesc];
    if (latestAggregate && !aggregateHistoryAsc.some((s) => s.createdAt === latestAggregate?.createdAt)) {
        aggregateHistoryAsc.push(latestAggregate);
    }
    if (requestedAggregate && !aggregateHistoryAsc.some((s) => s.createdAt === requestedAggregate.createdAt)) {
        aggregateHistoryAsc.push(requestedAggregate);
    }
    aggregateHistoryAsc.sort((a, b) => a.createdAt - b.createdAt);

    let historyDesc: OptionSnapshotDoc[] = [];
    let historyAsc: OptionSnapshotDoc[] = [];
    let latestSnapshot: OptionSnapshotDoc | null = null;
    let requestedSnapshot: OptionSnapshotDoc | null = null;
    let selectedSnapshot: OptionSnapshotDoc | null = null;

    if (!selectedAggregate) {
        historyDesc = await listSnapshotsForUnderlying(underlying, timelineFetchLimit);
        logStep(`loaded snapshot history fallback (entries=${historyDesc.length})`);
        latestSnapshot = historyDesc[0] ?? null;
        if (!latestSnapshot) {
            latestSnapshot = await getLatestSnapshotForUnderlying(underlying);
            logStep(`fetched latest snapshot fallback (${latestSnapshot ? "hit" : "miss"})`);
        }
        if (requestedSnapshotTs) {
            requestedSnapshot =
                historyDesc.find((entry) => entry.createdAt === requestedSnapshotTs) ??
                (latestSnapshot && latestSnapshot.createdAt === requestedSnapshotTs ? latestSnapshot : null);
            if (!requestedSnapshot) {
                requestedSnapshot = await getSnapshotForUnderlyingAt(underlying, requestedSnapshotTs);
                logStep(
                    `fetched requested snapshot ${requestedSnapshot ? "hit" : "miss"} (${new Date(requestedSnapshotTs).toISOString()})`
                );
            }
        }
        selectedSnapshot = requestedSnapshot ?? latestSnapshot ?? null;

        historyAsc = [...historyDesc];
        if (latestSnapshot && !historyAsc.some((s) => s.createdAt === latestSnapshot?.createdAt)) {
            historyAsc.push(latestSnapshot);
        }
        const snapshotToInclude = requestedSnapshot;
        if (snapshotToInclude && !historyAsc.some((s) => s.createdAt === snapshotToInclude.createdAt)) {
            historyAsc.push(snapshotToInclude);
        }
        historyAsc.sort((a, b) => a.createdAt - b.createdAt);
    }

    const expiryCandidates = new Set<number>();
    for (const aggregateEntry of aggregateHistoryAsc) {
        for (const exp of aggregateEntry.expiries ?? []) {
            if (typeof exp.expiry === "number" && Number.isFinite(exp.expiry)) {
                expiryCandidates.add(exp.expiry);
            }
        }
    }
    for (const snapshotEntry of historyAsc) {
        for (const exp of snapshotEntry.expiries ?? []) {
            if (typeof exp === "number" && Number.isFinite(exp)) {
                expiryCandidates.add(exp);
            }
        }
    }
    for (const exp of uniqueExpiriesForUnderlying(symbols, underlying)) {
        if (typeof exp === "number" && Number.isFinite(exp)) {
            expiryCandidates.add(exp);
        }
    }
    if (requestedExpiryValue != null && Number.isFinite(requestedExpiryValue)) {
        expiryCandidates.add(requestedExpiryValue);
    }
    const expiries = Array.from(expiryCandidates).sort((a, b) => a - b);
    const nowMs = Date.now();
    const upcomingExpiry = expiries.find((exp) => exp >= nowMs) ?? expiries.at(-1);
    const selectedExpiry = expiries.length
        ? requestedExpiryValue != null && expiryCandidates.has(requestedExpiryValue)
            ? requestedExpiryValue
            : upcomingExpiry ?? expiries[0]
        : undefined;

    if (!selectedExpiry) {
        return (
            <main className="relative flex min-h-screen flex-col gap-8 bg-gradient-to-b from-background via-background/80 to-background px-6 pb-16 pt-12 sm:px-12 lg:px-16">
                <section className="relative overflow-hidden rounded-3xl border border-border/40 bg-[radial-gradient(circle_at_top,_hsl(var(--highlight)/0.18)_0%,_transparent_55%)] p-8 shadow-glow-accent sm:p-12">
                    <div className="space-y-2">
                        <p className="inline-flex items-center rounded-full border border-highlight/30 bg-highlight/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-highlight">
                            Crypto Stats
                        </p>
                        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">Binance Options Contract Prices</h1>
                        <p className="text-sm text-muted-foreground">No expiries available for {underlying}.</p>
                    </div>
                </section>
            </main>
        );
    }

    // Build symbol source: snapshot symbols if available, else exchangeInfo symbols
    const symbolsSource = selectedSnapshot
        ? selectedSnapshot.symbols.map((s) => ({
            symbol: s.symbol,
            underlying: s.underlying,
            strikePrice: s.strikePrice,
            side: s.side,
            expiryDate: s.expiryDate,
            unit: s.unit,
        }))
        : symbols;

    // Live mark/greeks for overlay (and primary data when snapshot missing)
    const liveMarkEntries: MarkPriceEntry[] = await fetchAllMarkPrices();
    logStep(`fetched live mark prices (count=${liveMarkEntries.length})`);
    const priceBySymbolLive = new Map(liveMarkEntries.map((m) => [m.symbol, m.markPrice] as const));
    const markBySymbolLive = new Map(liveMarkEntries.map((m) => [m.symbol, m] as const));

    // Snapshot mark/greeks when available; fall back to live set for grid rendering
    const snapshotMarkEntries: MarkPriceEntry[] | null = selectedSnapshot
        ? selectedSnapshot.symbols.map((s) => ({
            symbol: s.symbol,
            markPrice: s.markPrice,
            bidIV: s.bidIV,
            askIV: s.askIV,
            markIV: s.markIV,
            delta: s.delta,
            theta: s.theta,
            gamma: s.gamma,
            vega: s.vega,
        }))
        : null;
    const markBySymbolSnapshot = snapshotMarkEntries
        ? new Map(snapshotMarkEntries.map((m) => [m.symbol, m] as const))
        : null;
    const priceBySymbolSnapshot = snapshotMarkEntries
        ? new Map(snapshotMarkEntries.map((m) => [m.symbol, m.markPrice] as const))
        : null;
    if (snapshotMarkEntries) {
        logStep(`loaded snapshot marks (count=${snapshotMarkEntries.length})`);
    }

    // Compute sentiment across expiries
    const indexPriceSnapshot = selectedAggregate?.indexPrice ?? selectedSnapshot?.indexPrice ?? null;
    const liveIndexPrice = await fetchIndexPrice(underlying);
    logStep(`fetched live index price (${liveIndexPrice.toFixed(2)})`);

    // Live open interest map for overlay metrics
    const oiBySymbolLive = new Map<string, number>();
    logStep(`fetching open interest for ${expiries.length} expiries`);
    const openInterestResults = await Promise.all(
        expiries.map(async (e) => {
            const yyMMdd = formatExpiryToYyMmDd(e);
            try {
                const oi = await fetchOpenInterest(underlying.replace("USDT", ""), yyMMdd);
                logStep(`open interest fetched for expiry ${yyMMdd} (symbols=${oi.length})`);
                return { expiry: e, entries: oi };
            } catch (error) {
                console.error(`${requestTag} failed to fetch open interest for ${yyMMdd}`, error);
                logStep(`open interest failed for expiry ${yyMMdd}`);
                return { expiry: e, entries: [] };
            }
        })
    );
    for (const { entries } of openInterestResults) {
        for (const o of entries) {
            oiBySymbolLive.set(o.symbol, o.sumOpenInterest);
        }
    }
    logStep(`aggregated open interest entries (${oiBySymbolLive.size})`);

    const aggregateByExpiry = new Map(
        (selectedAggregate?.expiries ?? []).map((entry) => [entry.expiry, entry] as const)
    );

    const sentimentPoints = expiries.map((e) => {
        const label = new Date(e).toLocaleDateString(undefined, { month: "short", day: "2-digit" });

        const aggregateForExpiry = aggregateByExpiry.get(e);
        let snapshotScore = aggregateForExpiry?.baseline ?? null;
        let snapshotRr = aggregateForExpiry?.rr25 ?? null;
        let snapshotPriceValue = aggregateForExpiry?.price ?? indexPriceSnapshot ?? null;

        if (!aggregateForExpiry && markBySymbolSnapshot && priceBySymbolSnapshot && indexPriceSnapshot != null) {
            const gridSnapshot = buildContractGrid(symbolsSource, underlying, e);
            if (gridSnapshot.length) {
                const snapshotBase = computeSentimentForExpiry(gridSnapshot, priceBySymbolSnapshot, indexPriceSnapshot, undefined);
                snapshotScore = snapshotBase.score ?? null;
                const snapshotRR = computeRR25ForExpiry(gridSnapshot, markBySymbolSnapshot);
                snapshotRr = snapshotRR.rr25 ?? null;
                snapshotPriceValue = indexPriceSnapshot;
            }
        }

        const gridLive = buildContractGrid(symbols, underlying, e);
        const liveBase = computeSentimentForExpiry(gridLive, priceBySymbolLive, liveIndexPrice, undefined);
        const liveOi = computeSentimentForExpiry(gridLive, priceBySymbolLive, liveIndexPrice, oiBySymbolLive);
        const liveRR = computeRR25ForExpiry(gridLive, markBySymbolLive);

        return {
            label,
            expiry: e,
            score: snapshotScore,
            scoreOi: null,
            rr25: snapshotRr,
            scoreLive: liveBase.score,
            scoreOiLive: liveOi.score,
            rr25Live: liveRR.rr25,
            priceSnapshot: snapshotPriceValue,
            priceLive: liveIndexPrice,
        };
    });
    logStep(`computed sentiment points (${sentimentPoints.length})`);

    const selectedPoint = sentimentPoints.find((p) => p.expiry === selectedExpiry) ?? null;
    const selectedSnapshotTimestamp = selectedAggregate?.createdAt ?? selectedSnapshot?.createdAt ?? null;
    const snapshotCapturedAt = selectedSnapshotTimestamp ? new Date(selectedSnapshotTimestamp) : null;

    const aggregateTimeline = selectedAggregate
        ? constrainTimeline(
            aggregateHistoryAsc,
            selectedSnapshotTimestamp,
            selectedTimelineWindow.lookbackMs,
            selectedTimelineResolution.stepMs
        )
        : [];
    const snapshotTimeline = selectedAggregate
        ? []
        : constrainTimeline(
            historyAsc,
            selectedSnapshotTimestamp,
            selectedTimelineWindow.lookbackMs,
            selectedTimelineResolution.stepMs
        );
    if (selectedAggregate) {
        logStep(
            `prepared aggregate timeline (entries=${aggregateTimeline.length}, raw=${aggregateHistoryAsc.length})`
        );
    } else {
        logStep(
            `prepared snapshot timeline fallback (entries=${snapshotTimeline.length}, raw=${historyAsc.length})`
        );
    }

    const summary = {
        baselineSnapshot: selectedPoint?.score ?? null,
        baselineLive: selectedPoint?.scoreLive ?? null,
        rrSnapshot: selectedPoint?.rr25 ?? null,
        rrLive: selectedPoint?.rr25Live ?? null,
        priceSnapshot: selectedPoint?.priceSnapshot ?? null,
        priceLive: selectedPoint?.priceLive ?? null,
    };

    const baselineDelta = buildDelta(summary.baselineLive, summary.baselineSnapshot, (abs) => `${(abs * 100).toFixed(1)} pp`);
    const rrDelta = buildDelta(summary.rrLive, summary.rrSnapshot, (abs) => `${(abs * 100).toFixed(2)} vol`);
    const priceDelta = buildDelta(summary.priceLive, summary.priceSnapshot, (abs) => formatPriceChange(abs));

    const metricsRows = sentimentPoints.map((point) => ({
        key: point.expiry,
        label: point.label,
        scoreSnapshot: point.score ?? null,
        scoreLive: point.scoreLive ?? null,
        priceSnapshot: point.priceSnapshot ?? null,
        priceLive: point.priceLive ?? null,
        rrSnapshot: point.rr25 ?? null,
        rrLive: point.rr25Live ?? null,
    }));

    const baseTimelinePoints = selectedAggregate
        ? aggregateTimeline.map((entry) => {
            const aggregateEntry = entry.expiries.find((exp) => exp.expiry === selectedExpiry) ?? null;
            const created = entry.createdAt;
            const date = new Date(created);
            return {
                createdAt: created,
                label: date.toLocaleString(undefined, {
                    month: "short",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                }),
                iso: date.toISOString(),
                price: aggregateEntry?.price ?? entry.indexPrice ?? null,
                baseline: aggregateEntry?.baseline ?? null,
                rr25: aggregateEntry?.rr25 ?? null,
            };
        })
        : snapshotTimeline.map((entry) => {
            const symbolInfos = entry.symbols.map((s) => ({
                symbol: s.symbol,
                underlying: s.underlying,
                strikePrice: s.strikePrice,
                side: s.side,
                expiryDate: s.expiryDate,
                unit: s.unit,
            }));
            const grid = buildContractGrid(symbolInfos, underlying, selectedExpiry);
            const markMap = new Map<string, MarkPriceEntry>(
                entry.symbols.map((s) => [
                    s.symbol,
                    {
                        symbol: s.symbol,
                        markPrice: s.markPrice,
                        bidIV: s.bidIV,
                        askIV: s.askIV,
                        markIV: s.markIV,
                        delta: s.delta,
                        theta: s.theta,
                        gamma: s.gamma,
                        vega: s.vega,
                    } satisfies MarkPriceEntry,
                ])
            );
            const priceMap = new Map<string, number | null>(entry.symbols.map((s) => [s.symbol, s.markPrice]));

            const baseline = grid.length
                ? computeSentimentForExpiry(grid, priceMap, entry.indexPrice, undefined)
                : { score: null };
            const rr = grid.length ? computeRR25ForExpiry(grid, markMap) : { rr25: null };

            const created = entry.createdAt;
            const date = new Date(created);
            return {
                createdAt: created,
                label: date.toLocaleString(undefined, {
                    month: "short",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                }),
                iso: date.toISOString(),
                price: entry.indexPrice,
                baseline: baseline.score,
                rr25: rr.rr25 ?? null,
            };
        });

    const timelinePoints = baseTimelinePoints.map((point, index, allPoints) => {
        const futureCandidates = allPoints.slice(index + 1).filter((candidate) => candidate.price != null);
        let future: (typeof baseTimelinePoints)[number] | undefined;
        if (selectedTimelineHorizon.type === "next") {
            future = futureCandidates[0];
        } else if (selectedTimelineHorizon.type === "duration") {
            const target = point.createdAt + selectedTimelineHorizon.durationMs;
            future = futureCandidates.find((candidate) => candidate.createdAt >= target);
        } else if (selectedTimelineHorizon.type === "expiry") {
            if (selectedExpiry > point.createdAt) {
                future = futureCandidates.find((candidate) => candidate.createdAt >= selectedExpiry);
            }
        }

        if (!future || point.price == null) {
            return { ...point, forwardReturn: null, sentimentAlignment: null, futureTimestamp: null };
        }
        const futureReturn = future.price != null && point.price !== 0
            ? (future.price - point.price) / point.price
            : null;
        const baselineScore = point.baseline ?? null;
        let sentimentAlignment: number | null = null;
        if (baselineScore != null && futureReturn != null) {
            const sentimentSign = baselineScore === 0 ? 0 : baselineScore > 0 ? 1 : -1;
            const futureSign = futureReturn === 0 ? 0 : futureReturn > 0 ? 1 : -1;
            if (sentimentSign === 0 || futureSign === 0) {
                sentimentAlignment = 0;
            } else {
                sentimentAlignment = Math.abs(baselineScore) * (sentimentSign === futureSign ? 1 : -1);
            }
        }
        return {
            ...point,
            forwardReturn: futureReturn,
            sentimentAlignment,
            futureTimestamp: future.iso,
        };
    });
    logStep(`assembled timeline points (${timelinePoints.length}) [horizon=${selectedTimelineHorizon.value}]`);

    const buildHref = (overrides: {
        underlying?: string;
        expiry?: number;
        timelineWindow?: string;
        timelineResolution?: string;
        timelineHorizon?: string;
        snapshot?: number | null;
    }) => {
        const search = new URLSearchParams();
        const underlyingValue = overrides.underlying ?? underlying;
        if (underlyingValue) {
            search.set("underlying", underlyingValue);
        }

        const expiryValue = overrides.expiry ?? selectedExpiry;
        if (typeof expiryValue === "number" && Number.isFinite(expiryValue)) {
            search.set("expiry", String(expiryValue));
        }

        const snapshotValue =
            overrides.snapshot === null
                ? null
                : overrides.snapshot ?? requestedSnapshotTs ?? null;
        if (snapshotValue != null) {
            search.set("snapshot", String(snapshotValue));
        }

        const windowValue = overrides.timelineWindow ?? selectedTimelineWindow.value;
        if (windowValue) {
            search.set("timelineWindow", windowValue);
        }

        const resolutionValue = overrides.timelineResolution ?? selectedTimelineResolution.value;
        if (resolutionValue) {
            search.set("timelineResolution", resolutionValue);
        }

        const horizonValue = overrides.timelineHorizon ?? selectedTimelineHorizon.value;
        if (horizonValue) {
            search.set("timelineHorizon", horizonValue);
        }

        return `/crypto-stats?${search.toString()}`;
    };

    const renderMetricCell = (
        snapshotValue: number | null | undefined,
        liveValue: number | null | undefined,
        formatter: (value: number | null | undefined) => string
    ) => (
        <div className="space-y-1 text-right">
            <div className="flex items-center justify-end gap-2">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Snap
                </Badge>
                <span className="font-medium text-foreground">{formatter(snapshotValue)}</span>
            </div>
            <div className="flex items-center justify-end gap-2 text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Live
                </Badge>
                <span className="font-medium text-foreground">{formatter(liveValue)}</span>
            </div>
        </div>
    );

    return (
        <main className="relative flex min-h-screen flex-col gap-8 bg-gradient-to-b from-background via-background/80 to-background px-6 pb-16 pt-12 sm:px-12 lg:px-16">
            <section className="relative overflow-hidden rounded-3xl border border-border/40 bg-[radial-gradient(circle_at_top,_hsl(var(--highlight)/0.18)_0%,_transparent_55%)] p-8 shadow-glow-accent sm:p-12">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="inline-flex items-center rounded-full border border-highlight/30 bg-highlight/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-highlight">
                            Crypto Stats
                        </p>
                        <div className="space-y-1">
                            <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">Dealer Positioning Monitor</h1>
                            <p className="text-sm text-muted-foreground">
                                Track how stored dealer positioning stacks up against live {underlying} options data across expiries.
                            </p>
                        </div>
                        {snapshotCapturedAt ? (
                            <p className="text-xs text-muted-foreground">
                                Snapshot captured {snapshotCapturedAt.toLocaleString()} • Firestore snapshot overlayed with live marks.
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">No snapshot captured yet — displaying live data only.</p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Underlying</span>
                        <UnderlyingSelect options={underlyings} />
                        <span className="font-medium text-foreground">Expiry focus</span>
                        <div className="flex flex-wrap gap-1">
                            {expiries.map((e) => {
                                const href = buildHref({ expiry: e });
                                const isActive = e === selectedExpiry;
                                return (
                                    <a
                                        key={e}
                                        href={href}
                                        className={cn(
                                            "rounded-md border px-2 py-1 transition-colors",
                                            isActive
                                                ? "border-highlight/60 bg-highlight/15 text-highlight shadow-sm"
                                                : "border-border/40 bg-muted/30 hover:border-border/60"
                                        )}
                                    >
                                        {new Date(e).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Timeline range</span>
                        <div className="flex flex-wrap gap-1">
                            {TIMELINE_WINDOWS.map((option) => {
                                const href = buildHref({ timelineWindow: option.value });
                                const isActive = option.value === selectedTimelineWindow.value;
                                return (
                                    <a
                                        key={option.value}
                                        href={href}
                                        className={cn(
                                            "rounded-md border px-2 py-1 transition-colors",
                                            isActive
                                                ? "border-highlight/60 bg-highlight/15 text-highlight shadow-sm"
                                                : "border-border/40 bg-muted/30 hover:border-border/60"
                                        )}
                                    >
                                        {option.label}
                                    </a>
                                );
                            })}
                        </div>
                        <span className="font-medium text-foreground">Resolution</span>
                        <div className="flex flex-wrap gap-1">
                            {TIMELINE_RESOLUTIONS.map((option) => {
                                const href = buildHref({ timelineResolution: option.value });
                                const isActive = option.value === selectedTimelineResolution.value;
                                return (
                                    <a
                                        key={option.value}
                                        href={href}
                                        className={cn(
                                            "rounded-md border px-2 py-1 transition-colors",
                                            isActive
                                                ? "border-highlight/60 bg-highlight/15 text-highlight shadow-sm"
                                                : "border-border/40 bg-muted/30 hover:border-border/60"
                                        )}
                                    >
                                        {option.label}
                                    </a>
                                );
                            })}
                        </div>
                        <span className="font-medium text-foreground">Forecast horizon</span>
                        <div className="flex flex-wrap gap-1">
                            {TIMELINE_HORIZONS.map((option) => {
                                const href = buildHref({ timelineHorizon: option.value });
                                const isActive = option.value === selectedTimelineHorizon.value;
                                return (
                                    <a
                                        key={option.value}
                                        href={href}
                                        className={cn(
                                            "rounded-md border px-2 py-1 transition-colors",
                                            isActive
                                                ? "border-highlight/60 bg-highlight/15 text-highlight shadow-sm"
                                                : "border-border/40 bg-muted/30 hover:border-border/60"
                                        )}
                                    >
                                        {option.label}
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            <div className="relative z-[1] space-y-8">
                <Suspense fallback={<ChartSkeleton title="Snapshot Price Timeline" />}>
                    <PriceTimelineChart
                        points={timelinePoints}
                        selectedTimestamp={selectedSnapshotTimestamp}
                        underlying={underlying}
                        expiry={selectedExpiry}
                        horizonLabel={selectedTimelineHorizon.label}
                    />
                </Suspense>

                <Suspense fallback={<ChartSkeleton title="Options Sentiment by Expiry" />}>
                    <SentimentChart points={sentimentPoints} />
                </Suspense>

                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="bg-card/80 shadow-sm backdrop-blur">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Expiry Context</CardTitle>
                                <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
                                    {selectedPoint?.label ?? "—"}
                                </Badge>
                            </div>
                            <CardDescription>Settlement timing and price anchors for the selected expiry.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Settlement</p>
                                <ExpiryTimeHint expiryMs={selectedExpiry} />
                            </div>
                            <Separator className="bg-border/60" />
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Snapshot price</span>
                                    <span className="font-medium text-foreground">{formatPriceValue(summary.priceSnapshot)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Live price</span>
                                    <span className="font-medium text-foreground">{formatPriceValue(summary.priceLive)}</span>
                                </div>
                                <p className={cn("text-xs", toneClass[priceDelta.tone])}>
                                    {priceDelta.text === "—" ? "—" : `${priceDelta.text} since snapshot`}
                                </p>
                            </div>
                            <Separator className="bg-border/60" />
                            <p className="text-xs text-muted-foreground">
                                {snapshotCapturedAt
                                    ? `Snapshot captured ${snapshotCapturedAt.toLocaleString()}`
                                    : "Waiting on first scheduled snapshot."}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/80 shadow-sm backdrop-blur">
                        <CardHeader>
                            <CardTitle className="text-base">Market Sentiment</CardTitle>
                            <CardDescription>Near-ATM call vs put balance and 25Δ risk reversal.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Snapshot
                                    </Badge>
                                    <span className="text-2xl font-semibold text-foreground">{formatPercent(summary.baselineSnapshot)}</span>
                                </div>
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <Badge variant="secondary" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Live
                                    </Badge>
                                    <span className="text-xl font-semibold text-foreground">{formatPercent(summary.baselineLive)}</span>
                                </div>
                                <p className={cn("text-xs", toneClass[baselineDelta.tone])}>
                                    {baselineDelta.text === "—" ? "No change recorded yet." : `${baselineDelta.text} since snapshot`}
                                </p>
                            </div>
                            <Separator className="bg-border/60" />
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">RR25 snapshot</span>
                                    <span className="font-medium text-foreground">{formatVolPoints(summary.rrSnapshot)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">RR25 live</span>
                                    <span className="font-medium text-foreground">{formatVolPoints(summary.rrLive)}</span>
                                </div>
                                <p className={cn("text-xs", toneClass[rrDelta.tone])}>
                                    {rrDelta.text === "—" ? "—" : `${rrDelta.text} since snapshot`}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/80 shadow-sm backdrop-blur">
                        <CardHeader>
                            <CardTitle className="text-base">Dealer Positioning</CardTitle>
                            <CardDescription>Aggregate gamma exposure inferred from mark greeks and OI.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <p className="text-xs text-muted-foreground">
                                Dealer GEX overlays have been removed from the chart to reduce clutter. You can still review gamma levels in Firestore snapshots or reintroduce them later if needed.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <Card className="bg-card/80 shadow-sm backdrop-blur">
                    <CardHeader>
                        <CardTitle className="text-base">Expiry Term Structure</CardTitle>
                        <CardDescription>Snapshot vs live metrics across listed expiries.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/30">
                                    <TableHead className="font-semibold text-foreground">Expiry</TableHead>
                                    <TableHead className="text-right font-semibold text-foreground">Baseline</TableHead>
                                    <TableHead className="text-right font-semibold text-foreground">Dealer GEX</TableHead>
                                    <TableHead className="text-right font-semibold text-foreground">Index Price</TableHead>
                                    <TableHead className="text-right font-semibold text-foreground">RR25</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {metricsRows.map((row) => (
                                    <TableRow
                                        key={row.key}
                                        className={cn(
                                            "border-border/50",
                                            row.key === selectedExpiry ? "border-highlight/60 bg-highlight/10" : undefined
                                        )}
                                    >
                                        <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                                        <TableCell>{renderMetricCell(row.scoreSnapshot, row.scoreLive, formatPercent)}</TableCell>
                                        <TableCell>{renderMetricCell(null, null, () => "—")}</TableCell>
                                        <TableCell>{renderMetricCell(row.priceSnapshot, row.priceLive, formatPriceValue)}</TableCell>
                                        <TableCell>{renderMetricCell(row.rrSnapshot, row.rrLive, formatVolPoints)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <p className="text-xs text-muted-foreground">
                            Snapshot rows reflect the last Firestore capture per expiry; live rows update whenever you refresh this page.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
