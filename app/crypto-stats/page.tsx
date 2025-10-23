import ContractPriceGrid from "@/components/options/contract-price-grid";
import SentimentChart from "@/components/options/sentiment-chart";
import UnderlyingSelect from "@/components/options/underlying-select";
import ExpiryTimeHint from "@/components/options/expiry-time-hint";
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
    computeDealerGexForExpiry,
} from "@/lib/services/binance";

interface PageProps {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const toStringParam = (v: string | string[] | undefined, fallback: string) =>
    Array.isArray(v) ? v[0] ?? fallback : v ?? fallback;

const toNum = (v: unknown): number | undefined => {
    if (v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

export default async function CryptoStats({ searchParams }: PageProps) {
    const params = (await searchParams) ?? {};
    const underlying = toStringParam(params.underlying, "BTCUSDT");

    const { symbols } = await fetchExchangeInfo();
    const underlyings = Array.from(new Set(symbols.map((s) => s.underlying))).sort();
    const expiries = uniqueExpiriesForUnderlying(symbols, underlying);
    const selectedExpiry = expiries.length
        ? toNum(toStringParam(params.expiry as any, String(expiries[0] ?? ""))) ?? expiries[0]
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

    const grid = buildContractGrid(symbols, underlying, selectedExpiry);
    const markEntries: MarkPriceEntry[] = await fetchAllMarkPrices();
    const priceBySymbol = new Map(markEntries.map((m) => [m.symbol, m.markPrice] as const));
    const markBySymbolFull = new Map(markEntries.map((m) => [m.symbol, m] as const));

    const rows = grid.map((g) => ({
        strike: g.strike,
        callSymbol: g.callSymbol,
        putSymbol: g.putSymbol,
        callPrice: g.callSymbol ? priceBySymbol.get(g.callSymbol) ?? null : null,
        putPrice: g.putSymbol ? priceBySymbol.get(g.putSymbol) ?? null : null,
    }));

    const subtitle = `${underlying} • ${new Date(selectedExpiry).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
    })}`;

    // Compute sentiment across expiries
    const indexPrice = await fetchIndexPrice(underlying);
    const oiBySymbol = new Map<string, number>();
    // Try to enrich with OI for each expiry (gracefully skip on failure)
    for (const e of expiries) {
        try {
            const yyMMdd = formatExpiryToYyMmDd(e);
            const oi = await fetchOpenInterest(underlying.replace("USDT", ""), yyMMdd);
            for (const o of oi) {
                oiBySymbol.set(o.symbol, o.sumOpenInterest);
            }
        } catch { }
    }

    const sentimentPoints = expiries.map((e) => {
        const g = buildContractGrid(symbols, underlying, e);
        const sOi = computeSentimentForExpiry(g, priceBySymbol, indexPrice, oiBySymbol);
        const sBase = computeSentimentForExpiry(g, priceBySymbol, indexPrice, undefined);
        const rr = computeRR25ForExpiry(g, markBySymbolFull);
        const gex = computeDealerGexForExpiry(
            g,
            markBySymbolFull,
            oiBySymbol,
            indexPrice,
            new Map(symbols.map((s) => [s.symbol, s.unit ?? 1]))
        );
        return {
            label: new Date(e).toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
            expiry: e,
            score: sBase.score,
            scoreOi: sOi.score,
            rr25: rr.rr25,
            gex: gex.gex,
        };
    });

    return (
        <main className="relative flex min-h-screen flex-col gap-8 bg-gradient-to-b from-background via-background/80 to-background px-6 pb-16 pt-12 sm:px-12 lg:px-16">
            <section className="relative overflow-hidden rounded-3xl border border-border/40 bg-[radial-gradient(circle_at_top,_hsl(var(--highlight)/0.18)_0%,_transparent_55%)] p-8 shadow-glow-accent sm:p-12">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2">
                        <p className="inline-flex items-center rounded-full border border-highlight/30 bg-highlight/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-highlight">
                            Crypto Stats
                        </p>
                        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">Binance Options Contract Prices</h1>
                        <p className="text-sm text-muted-foreground">Browse mark prices by strike for calls and puts.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-medium">Underlying:</span>
                        <UnderlyingSelect options={underlyings} />
                        <span className="font-medium">Expiry:</span>
                        <div className="flex flex-wrap gap-1">
                            {expiries.map((e) => {
                                const href = `/crypto-stats?underlying=${encodeURIComponent(underlying)}&expiry=${e}`;
                                const isActive = e === selectedExpiry;
                                return (
                                    <a
                                        key={e}
                                        href={href}
                                        className={`rounded-md border px-2 py-1 ${isActive ? "border-highlight/60 bg-highlight/15 text-highlight" : "border-border/40 bg-muted/30"
                                            }`}
                                    >
                                        {new Date(e).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}
                                    </a>
                                );
                            })}
                        </div>
                        {selectedExpiry ? (
                            <div className="mt-1 w-full">
                                <ExpiryTimeHint expiryMs={selectedExpiry} />
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>

            <section className="relative z-[1] grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
                <div>
                    <ContractPriceGrid title="Contract Price Grid" subtitle={subtitle} rows={rows} quote="USDT" />
                </div>
                <div>
                    <SentimentChart points={sentimentPoints} />
                </div>
            </section>
        </main>
    );
}
