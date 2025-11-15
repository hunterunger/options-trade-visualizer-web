import type {
    BaselineSentimentResult,
    ForwardReturnMap,
    ForwardReturnHorizon,
    NetDeltaTiltResult,
    OptionContract,
    OptionExpirySignals,
    OptionOpenInterest,
    OptionPricePoint,
    RiskReversalResult,
} from "@/lib/options/types";

interface BaselineSentimentOptions {
    strikeWindowPct?: number;
    weightExponent?: number;
}

const DEFAULT_BASELINE_SENTIMENT_OPTIONS: Required<BaselineSentimentOptions> = {
    strikeWindowPct: 0.2,
    weightExponent: 1.25,
};

interface RiskReversalOptions {
    targetDelta?: number;
}

const DEFAULT_RISK_REVERSAL_OPTIONS: Required<RiskReversalOptions> = {
    targetDelta: 0.25,
};

interface NetDeltaTiltOptions {
    minDelta?: number;
}

const DEFAULT_NET_DELTA_OPTIONS: Required<NetDeltaTiltOptions> = {
    minDelta: 0.05,
};

const DEFAULT_FORWARD_HORIZONS: Record<ForwardReturnHorizon, number> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const normalizeIv = (contract: OptionContract) => {
    if (isFiniteNumber(contract.markIV)) {
        return contract.markIV as number;
    }
    if (isFiniteNumber(contract.bidIV) && isFiniteNumber(contract.askIV)) {
        return ((contract.bidIV as number) + (contract.askIV as number)) / 2;
    }
    if (isFiniteNumber(contract.bidIV)) {
        return contract.bidIV as number;
    }
    if (isFiniteNumber(contract.askIV)) {
        return contract.askIV as number;
    }
    return null;
};

export const computeBaselineSentiment = (
    contracts: OptionContract[],
    indexPrice: number,
    options: BaselineSentimentOptions = {},
): BaselineSentimentResult => {
    const { strikeWindowPct, weightExponent } = {
        ...DEFAULT_BASELINE_SENTIMENT_OPTIONS,
        ...options,
    };

    if (!contracts.length || !isFiniteNumber(indexPrice) || indexPrice <= 0) {
        return { value: null, strikesConsidered: 0 };
    }

    const filtered = contracts.filter((contract) => {
        if (!isFiniteNumber(contract.markPrice)) {
            return false;
        }
        const distance = Math.abs(contract.strikePrice - indexPrice) / indexPrice;
        return distance <= strikeWindowPct;
    });

    if (!filtered.length) {
        return { value: null, strikesConsidered: 0 };
    }

    let callScore = 0;
    let putScore = 0;

    filtered.forEach((contract) => {
        const distance = Math.abs(contract.strikePrice - indexPrice);
        const weight = 1 / (1 + distance ** weightExponent);
        const premium = contract.markPrice as number;
        if (contract.side === "CALL") {
            callScore += weight * premium;
        } else {
            putScore += weight * premium;
        }
    });

    const total = callScore + putScore;
    if (total === 0) {
        return { value: null, strikesConsidered: filtered.length };
    }

    const value = (callScore - putScore) / total;
    return { value: Math.max(-1, Math.min(1, value)), strikesConsidered: filtered.length };
};

export const computeRiskReversal25 = (
    contracts: OptionContract[],
    options: RiskReversalOptions = {},
): RiskReversalResult => {
    const { targetDelta } = { ...DEFAULT_RISK_REVERSAL_OPTIONS, ...options };
    if (!contracts.length) {
        return { rr25: null };
    }

    const call = contracts
        .filter((contract) => contract.side === "CALL" && isFiniteNumber(contract.delta))
        .reduce<OptionContract | null>((closest, contract) => {
            if (!contract.delta) {
                return closest;
            }
            if (!closest) {
                return contract;
            }
            const deltaDistance = Math.abs((contract.delta as number) - targetDelta);
            const closestDistance = Math.abs((closest.delta as number) - targetDelta);
            return deltaDistance < closestDistance ? contract : closest;
        }, null);

    const put = contracts
        .filter((contract) => contract.side === "PUT" && isFiniteNumber(contract.delta))
        .reduce<OptionContract | null>((closest, contract) => {
            if (!contract.delta) {
                return closest;
            }
            if (!closest) {
                return contract;
            }
            const deltaDistance = Math.abs((contract.delta as number) + targetDelta);
            const closestDistance = Math.abs((closest.delta as number) + targetDelta);
            return deltaDistance < closestDistance ? contract : closest;
        }, null);

    if (!call || !put) {
        return { rr25: null };
    }

    const callIv = normalizeIv(call);
    const putIv = normalizeIv(put);
    if (!isFiniteNumber(callIv) || !isFiniteNumber(putIv)) {
        return { rr25: null };
    }

    return {
        rr25: (callIv as number) - (putIv as number),
        callStrike: call.strikePrice,
        putStrike: put.strikePrice,
    };
};

export const computeNetDeltaTilt = (
    contracts: OptionContract[],
    openInterest: OptionOpenInterest[] | undefined,
    options: NetDeltaTiltOptions = {},
): NetDeltaTiltResult => {
    const { minDelta } = { ...DEFAULT_NET_DELTA_OPTIONS, ...options };
    if (!contracts.length || !openInterest?.length) {
        return { value: null, notionalsConsidered: 0 };
    }

    const interestMap = new Map(openInterest.map((entry) => [entry.symbol, entry.openInterest]));

    let numerator = 0;
    let denominator = 0;

    contracts.forEach((contract) => {
        const oi = interestMap.get(contract.symbol);
        if (!isFiniteNumber(oi) || !isFiniteNumber(contract.delta)) {
            return;
        }
        const deltaValue = Math.abs(contract.delta as number);
        if (deltaValue < minDelta) {
            return;
        }
        numerator += (contract.delta as number) * (oi as number);
        denominator += Math.abs(oi as number);
    });

    if (denominator === 0) {
        return { value: null, notionalsConsidered: 0 };
    }

    const value = numerator / denominator;
    return {
        value: Math.max(-1, Math.min(1, value)),
        notionalsConsidered: denominator,
    };
};

export const computeForwardReturns = (
    timeline: OptionPricePoint[],
    anchorTimestamp: number,
    horizons: Record<ForwardReturnHorizon, number> = DEFAULT_FORWARD_HORIZONS,
): ForwardReturnMap => {
    if (!timeline.length) {
        return Object.keys(horizons).reduce<ForwardReturnMap>((acc, key) => {
            acc[key as ForwardReturnHorizon] = null;
            return acc;
        }, {} as ForwardReturnMap);
    }

    const sorted = [...timeline].sort((a, b) => a.timestamp - b.timestamp);

    const anchor = sorted.find((point) => point.timestamp >= anchorTimestamp) ?? sorted[sorted.length - 1];
    const anchorPrice = anchor.price;

    return Object.entries(horizons).reduce<ForwardReturnMap>((acc, [label, offset]) => {
        const targetTime = anchor.timestamp + offset;
        const future = sorted.find((point) => point.timestamp >= targetTime);
        if (!future) {
            acc[label as ForwardReturnHorizon] = null;
            return acc;
        }
        acc[label as ForwardReturnHorizon] = (future.price - anchorPrice) / anchorPrice;
        return acc;
    }, {} as ForwardReturnMap);
};

interface ComputeOptionSignalsInput {
    expiry: number;
    contracts: OptionContract[];
    indexPrice: number;
    openInterest?: OptionOpenInterest[];
    anchorTimestamp: number;
    priceTimeline?: OptionPricePoint[];
    baselineOptions?: BaselineSentimentOptions;
    riskReversalOptions?: RiskReversalOptions;
    netDeltaOptions?: NetDeltaTiltOptions;
    forwardHorizons?: Record<ForwardReturnHorizon, number>;
}

export const computeOptionSignals = (
    input: ComputeOptionSignalsInput,
): OptionExpirySignals => {
    const baseline = computeBaselineSentiment(input.contracts, input.indexPrice, input.baselineOptions);
    const rr = computeRiskReversal25(input.contracts, input.riskReversalOptions);
    const netDelta = computeNetDeltaTilt(input.contracts, input.openInterest, input.netDeltaOptions);
    const forwardReturns = input.priceTimeline
        ? computeForwardReturns(
            input.priceTimeline,
            input.anchorTimestamp,
            input.forwardHorizons ?? DEFAULT_FORWARD_HORIZONS,
        )
        : null;

    return {
        expiry: input.expiry,
        baseline: baseline.value,
        rr25: rr.rr25,
        netDeltaTilt: netDelta.value,
        forwardReturns,
        strikesConsidered: baseline.strikesConsidered,
    };
};

export const DEFAULT_OPTION_FORWARD_HORIZONS = DEFAULT_FORWARD_HORIZONS;
