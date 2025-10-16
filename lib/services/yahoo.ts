import YahooFinance from "yahoo-finance2";
import type {
    OptionContractSnapshot,
    OpenInterestPoint,
    OptionType,
    QuoteSnapshot,
    RealizedVolatilitySnapshot,
    VolatilitySmilePoint,
} from "@/types/options";

interface RawOptionLeg {
    contractSymbol?: string;
    strike?: number | string;
    lastPrice?: number | string;
    bid?: number;
    ask?: number;
    impliedVolatility?: number | string;
    delta?: number | string;
    gamma?: number | string;
    theta?: number | string;
    vega?: number | string;
    rho?: number | string;
    openInterest?: number;
    volume?: number;
    inTheMoney?: boolean;
}

interface RawOptionsResponse {
    expirationDates?: Array<number | string | Date>;
    options?: Array<{
        expirationDate?: number | string | Date;
        calls?: RawOptionLeg[];
        puts?: RawOptionLeg[];
    }>;
}

const yahooFinance = new YahooFinance();

const OPTION_TYPE_MAP: Record<OptionType, "calls" | "puts"> = {
    call: "calls",
    put: "puts",
};

const toNumber = (value: unknown) => {
    const parsed = typeof value === "number" ? value : Number(value ?? NaN);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const toTimestamp = (value: unknown) => {
    if (value instanceof Date) {
        return Math.floor(value.getTime() / 1000);
    }
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        const parsedDate = Date.parse(value);
        return Number.isNaN(parsedDate) ? undefined : Math.floor(parsedDate / 1000);
    }
    return undefined;
};

const toIsoDateString = (value: unknown) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const timestamp = toTimestamp(value);
    if (typeof timestamp === "number") {
        return new Date(timestamp * 1000).toISOString().slice(0, 10);
    }

    return undefined;
};

export const fetchQuote = async (symbol: string): Promise<QuoteSnapshot> => {
    const quote = await yahooFinance.quote(symbol, {
        fields: [
            "regularMarketPrice",
            "regularMarketChange",
            "regularMarketChangePercent",
            "regularMarketPreviousClose",
            "regularMarketVolume",
        ],
    });

    return {
        symbol: quote.symbol ?? symbol.toUpperCase(),
        price: Number(quote.regularMarketPrice ?? 0),
        change: Number(quote.regularMarketChange ?? 0),
        changePercent: Number(quote.regularMarketChangePercent ?? 0),
        previousClose: quote.regularMarketPreviousClose ?? undefined,
        volume: quote.regularMarketVolume ?? undefined,
    };
};

export interface FetchOptionsChainResult {
    expirationDates: string[];
    contracts: OptionContractSnapshot[];
    volatilitySmile: VolatilitySmilePoint[];
    openInterest: OpenInterestPoint[];
    resolvedExpiration?: string;
}

export const fetchOptionsChain = async (
    symbol: string,
    expiration?: string,
): Promise<FetchOptionsChainResult> => {
    const optionsResponse = (await yahooFinance.options(
        symbol,
        expiration ? { date: new Date(expiration) } : undefined,
    )) as RawOptionsResponse;

    const expirationDates = (optionsResponse.expirationDates ?? [])
        .map((timestamp: unknown) => toTimestamp(timestamp))
        .filter((value: number | undefined): value is number => typeof value === "number")
        .map((timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 10));

    const contracts: OptionContractSnapshot[] = [];
    const volatilitySmile: VolatilitySmilePoint[] = [];
    const openInterest: OpenInterestPoint[] = [];

    const optionSlices = optionsResponse.options ?? [];

    const directMatch = expiration
        ? optionSlices.find((slice) => toIsoDateString(slice?.expirationDate) === expiration)
        : undefined;

    const fallbackSlice = optionSlices.find((slice) => (slice?.calls?.length ?? 0) + (slice?.puts?.length ?? 0) > 0)
        ?? optionSlices[0];

    const optionSlice = directMatch ?? fallbackSlice;
    const resolvedExpirationValue = toIsoDateString(optionSlice?.expirationDate)
        ?? expiration
        ?? expirationDates[0]
        ?? undefined;

    for (const type of ["call", "put"] as const) {
        const leg = optionSlice?.[OPTION_TYPE_MAP[type]] ?? [];
        for (const contract of leg) {
            const impliedVol = Number(contract.impliedVolatility ?? 0);
            const oi = contract.openInterest ?? 0;

            contracts.push({
                contractSymbol: contract.contractSymbol ?? "",
                strike: Number(contract.strike ?? 0),
                lastPrice: Number(contract.lastPrice ?? 0),
                bid: contract.bid ?? undefined,
                ask: contract.ask ?? undefined,
                impliedVolatility: impliedVol && Number.isFinite(impliedVol) ? impliedVol : undefined,
                delta: toNumber(contract.delta),
                gamma: toNumber(contract.gamma),
                theta: toNumber(contract.theta),
                vega: toNumber(contract.vega),
                rho: toNumber(contract.rho),
                openInterest: oi,
                volume: contract.volume ?? undefined,
                inTheMoney: contract.inTheMoney ?? undefined,
                expiration: resolvedExpirationValue ?? "",
                optionType: type,
            });

            if (impliedVol && Number.isFinite(impliedVol)) {
                volatilitySmile.push({
                    strike: Number(contract.strike ?? 0),
                    impliedVolatility: impliedVol,
                    type,
                });
            }

            if (oi) {
                openInterest.push({
                    strike: Number(contract.strike ?? 0),
                    openInterest: oi,
                    type,
                });
            }
        }
    }

    return {
        expirationDates,
        contracts,
        volatilitySmile,
        openInterest,
        resolvedExpiration: resolvedExpirationValue,
    };
};

const TRADING_DAYS_PER_YEAR = 252;

export const fetchRealizedVolatility = async (
    symbol: string,
    window: number = 21,
): Promise<RealizedVolatilitySnapshot | null> => {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - Math.max(window * 3, window + 10));

    const history = await yahooFinance.historical(symbol, {
        period1: periodStart,
        period2: periodEnd,
        interval: "1d",
    });

    const closes = history
        .map((row) => toNumber(row.adjClose ?? row.close))
        .filter((value: number | undefined): value is number => typeof value === "number" && value > 0);

    if (closes.length < 2) {
        return null;
    }

    const logReturns: number[] = [];
    for (let i = 1; i < closes.length; i += 1) {
        const previous = closes[i - 1];
        const current = closes[i];
        if (!previous || !current) continue;
        const ret = Math.log(current / previous);
        if (Number.isFinite(ret)) {
            logReturns.push(ret);
        }
    }

    const sample = logReturns.length >= window ? logReturns.slice(-window) : logReturns;

    if (sample.length < 2) {
        return null;
    }

    const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
    const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(sample.length - 1, 1);
    const standardDeviation = Math.sqrt(Math.max(variance, 0));
    const annualized = standardDeviation * Math.sqrt(TRADING_DAYS_PER_YEAR);

    return {
        value: annualized,
        window: sample.length,
        observations: logReturns.length,
    };
};
