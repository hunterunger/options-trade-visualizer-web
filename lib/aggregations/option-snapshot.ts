import {
    buildContractGrid,
    computeRR25ForExpiry,
    computeSentimentForExpiry,
    type MarkPriceEntry,
    type OptionSymbolInfo,
} from "@/lib/services/binance";
import {
    type OptionSnapshotDoc,
    type SaveSnapshotAggregateInput,
    type SnapshotExpiryAggregate,
    type SnapshotSymbolEntry,
} from "@/lib/repositories/option-snapshots";

const AGGREGATE_VERSION = 1;

const toSymbolInfo = (entry: SnapshotSymbolEntry): OptionSymbolInfo => ({
    symbol: entry.symbol,
    underlying: entry.underlying,
    strikePrice: entry.strikePrice,
    side: entry.side,
    expiryDate: entry.expiryDate,
    unit: entry.unit,
});

const toMarkEntry = (entry: SnapshotSymbolEntry): MarkPriceEntry => ({
    symbol: entry.symbol,
    markPrice: entry.markPrice,
    bidIV: entry.bidIV,
    askIV: entry.askIV,
    markIV: entry.markIV,
    delta: entry.delta,
    theta: entry.theta,
    gamma: entry.gamma,
    vega: entry.vega,
});

export const buildSnapshotAggregate = (snapshot: OptionSnapshotDoc): SaveSnapshotAggregateInput => {
    const symbolInfos: OptionSymbolInfo[] = snapshot.symbols.map(toSymbolInfo);
    const markMap = new Map<string, MarkPriceEntry>(snapshot.symbols.map((entry) => [entry.symbol, toMarkEntry(entry)]));
    const priceMap = new Map<string, number | null>(snapshot.symbols.map((entry) => [entry.symbol, entry.markPrice]));

    const expiries: SnapshotExpiryAggregate[] = snapshot.expiries.map((expiry) => {
        const grid = buildContractGrid(symbolInfos, snapshot.underlying, expiry);
        if (!grid.length) {
            return {
                expiry,
                baseline: null,
                rr25: null,
                price: snapshot.indexPrice ?? null,
                strikesConsidered: 0,
            } satisfies SnapshotExpiryAggregate;
        }
        const baseline = computeSentimentForExpiry(grid, priceMap, snapshot.indexPrice, undefined);
        const rr = computeRR25ForExpiry(grid, markMap);
        return {
            expiry,
            baseline: baseline.score ?? null,
            rr25: rr.rr25 ?? null,
            price: snapshot.indexPrice ?? null,
            strikesConsidered: baseline.strikesConsidered,
        } satisfies SnapshotExpiryAggregate;
    });

    return {
        underlying: snapshot.underlying,
        createdAt: snapshot.createdAt,
        indexPrice: snapshot.indexPrice ?? null,
        expiries,
        metadata: {
            version: AGGREGATE_VERSION,
            sourceSnapshotId: snapshot.id,
        },
    } satisfies SaveSnapshotAggregateInput;
};
