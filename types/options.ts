export type OptionType = "call" | "put";

export type OptionPosition = "long" | "short";

export type OptionMoneyness = "ITM" | "ATM" | "OTM";

export interface OptionAnalysisInput {
    symbol: string;
    expiration: string;
    optionType: OptionType;
    position: OptionPosition;
    strike: number;
    premium?: number;
    quantity: number;
    interestRate: number;
    dividendYield: number;
    volatility?: number;
    underlyingOverride?: number;
}

export interface QuoteSnapshot {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    previousClose?: number;
    volume?: number;
}

export interface OptionContractSnapshot {
    contractSymbol: string;
    strike: number;
    lastPrice: number;
    bid?: number;
    ask?: number;
    impliedVolatility?: number;
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    rho?: number;
    openInterest?: number;
    volume?: number;
    inTheMoney?: boolean;
    expiration: string;
    optionType: OptionType;
}

export interface OptionGreeks {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
}

export interface ProfitPoint {
    price: number;
    profit: number;
}

export interface VolatilitySmilePoint {
    strike: number;
    impliedVolatility: number;
    type: OptionType;
}

export interface OpenInterestPoint {
    strike: number;
    openInterest: number;
    type: OptionType;
}

export interface RealizedVolatilitySnapshot {
    value: number;
    window: number;
    observations: number;
}

export interface OptionAnalytics {
    underlyingPrice: number;
    position: OptionPosition;
    breakEven: number;
    maxProfit: number | null;
    maxLoss: number | null;
    probabilityInTheMoney: number;
    expectedMove: number;
    annualizedReturn: number | null;
    payoffAtExpiration: ProfitPoint[];
    greeks: OptionGreeks;
    moneyness: OptionMoneyness;
    premiumPerContract: number;
    positionPremium: number;
    intrinsicValuePerContract: number;
    intrinsicValueTotal: number;
    timeValuePerContract: number;
    timeValueTotal: number;
    contracts: number;
    contractSize: number;
}

export interface OptionAnalysisResult {
    quote: QuoteSnapshot;
    contract?: OptionContractSnapshot;
    analytics: OptionAnalytics;
    openInterest: OpenInterestPoint[];
    volatilitySmile: VolatilitySmilePoint[];
    notableStrikes: OptionContractSnapshot[];
    resolvedExpiration?: string;
    realizedVolatility?: RealizedVolatilitySnapshot;
}
