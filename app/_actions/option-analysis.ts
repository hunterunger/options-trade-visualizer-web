'use server';

import type {
    OptionAnalysisResult,
    OptionContractSnapshot,
    OptionType,
    QuoteSnapshot,
} from "@/types/options";
import type { OptionAnalysisSchema } from "@/lib/validations/options";
import { optionAnalysisSchema } from "@/lib/validations/options";
import { buildOptionAnalytics } from "@/lib/calculations/black-scholes";
import { fetchOptionsChain, fetchQuote, fetchRealizedVolatility } from "@/lib/services/yahoo";

export interface OptionAnalysisActionResult {
    success: boolean;
    data?: OptionAnalysisResult;
    errors?: Record<string, string[]>;
    message?: string;
}

export interface OptionPrefillSuggestion {
    symbol: string;
    expiration: string;
    optionType: OptionType;
    strike: number;
    premium?: number;
    impliedVolatility?: number;
    underlyingPrice: number;
    contractSymbol?: string;
    expirationDates: string[];
    quote: QuoteSnapshot;
}

export interface OptionPrefillResult {
    success: boolean;
    data?: OptionPrefillSuggestion;
    message?: string;
}

export const analyzeOptionTrade = async (formData: FormData): Promise<OptionAnalysisActionResult> => {
    const entries = Object.fromEntries(formData.entries());
    const parsed = optionAnalysisSchema.safeParse(entries);

    if (!parsed.success) {
        const formatted = parsed.error.flatten().fieldErrors;
        return {
            success: false,
            errors: formatted,
            message: 'Please correct the highlighted errors.',
        };
    }

    const payload: OptionAnalysisSchema = parsed.data;

    try {
        const [quote, chain, realizedVolatility] = await Promise.all([
            fetchQuote(payload.symbol),
            fetchOptionsChain(payload.symbol, payload.expiration),
            fetchRealizedVolatility(payload.symbol, 21).catch(() => null),
        ]);

        const effectiveExpiration = chain.resolvedExpiration ?? payload.expiration;

        const optionSlice = chain.contracts.filter(
            (contract) =>
                contract.optionType === payload.optionType &&
                Math.abs(contract.strike - payload.strike) < 1e-6 &&
                contract.expiration === effectiveExpiration,
        );

        const contract = optionSlice.sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))[0];

        const premium = payload.premium ?? contract?.lastPrice ?? 0;
        const impliedVolatility = payload.volatility ?? contract?.impliedVolatility ?? 0.22;

        const analysisInput = {
            symbol: payload.symbol,
            expiration: effectiveExpiration,
            optionType: payload.optionType,
            position: payload.position,
            strike: payload.strike,
            premium,
            quantity: payload.quantity,
            interestRate: payload.interestRate,
            dividendYield: payload.dividendYield,
            volatility: impliedVolatility,
            underlyingOverride: payload.underlyingOverride,
        };

        const underlyingPrice = payload.underlyingOverride ?? quote.price;
        const analytics = buildOptionAnalytics(
            {
                ...analysisInput,
            },
            underlyingPrice,
            impliedVolatility,
            premium,
        );

        const notableStrikes = chain.contracts
            .filter((item) => item.openInterest)
            .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
            .slice(0, 6);

        const data: OptionAnalysisResult = {
            quote,
            contract,
            analytics,
            openInterest: chain.openInterest,
            volatilitySmile: chain.volatilitySmile,
            notableStrikes,
            resolvedExpiration: effectiveExpiration,
            realizedVolatility: realizedVolatility ?? undefined,
        };

        return {
            success: true,
            data,
        };
    } catch (error) {
        console.error('Option analysis failed', error);
        return {
            success: false,
            message: 'Unable to analyze trade. Please verify the ticker and expiration.',
        };
    }
};

export const analyzeOptionAction = async (
    _prevState: OptionAnalysisActionResult | null,
    formData: FormData,
): Promise<OptionAnalysisActionResult> => analyzeOptionTrade(formData);

const pickDefaultExpiration = (contracts: OptionContractSnapshot[]) => {
    if (!contracts.length) return undefined;
    return contracts
        .map((contract) => contract.expiration)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];
};

const pickAtmContract = (
    contracts: OptionContractSnapshot[],
    price: number,
    targetExpiration?: string,
) => {
    const scoped = targetExpiration
        ? contracts.filter((contract) => contract.expiration === targetExpiration)
        : contracts;

    if (!scoped.length) {
        return contracts[0];
    }

    return scoped
        .slice()
        .sort((a, b) => {
            const distanceA = Math.abs(a.strike - price);
            const distanceB = Math.abs(b.strike - price);
            if (distanceA !== distanceB) return distanceA - distanceB;
            const interestA = a.openInterest ?? 0;
            const interestB = b.openInterest ?? 0;
            if (interestA !== interestB) return interestB - interestA;
            return (b.lastPrice ?? 0) - (a.lastPrice ?? 0);
        })[0];
};

export const suggestOptionDefaults = async (rawSymbol: string): Promise<OptionPrefillResult> => {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol) {
        return {
            success: false,
            message: "Enter a ticker symbol to load defaults.",
        };
    }

    try {
        const quote = await fetchQuote(symbol);
        const chain = await fetchOptionsChain(symbol);

        if (!chain.contracts.length) {
            return {
                success: false,
                message: "No option contracts available for this symbol.",
            };
        }

        const defaultExpiration = pickDefaultExpiration(chain.contracts) ?? chain.expirationDates[0];
        const bestContract = pickAtmContract(chain.contracts, quote.price, defaultExpiration);

        if (!bestContract) {
            return {
                success: false,
                message: "Unable to locate a nearby option contract.",
            };
        }

        return {
            success: true,
            data: {
                symbol: quote.symbol,
                expiration: bestContract.expiration,
                optionType: bestContract.optionType,
                strike: bestContract.strike,
                premium: bestContract.lastPrice,
                impliedVolatility: bestContract.impliedVolatility,
                underlyingPrice: quote.price,
                contractSymbol: bestContract.contractSymbol,
                expirationDates: chain.expirationDates,
                quote,
            },
        };
    } catch (error) {
        console.error("Option default suggestion failed", error);
        return {
            success: false,
            message: "We couldn’t auto-fill this symbol. Try submitting the form manually.",
        };
    }
};
