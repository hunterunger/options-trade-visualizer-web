import type { z } from "zod";
import {
    optionAggregateExpirySchema,
    optionAggregateSchema,
    optionContractSchema,
    optionOpenInterestSchema,
    optionPricePointSchema,
    optionSnapshotSchema,
} from "@/lib/options/schemas";

export type OptionContract = z.infer<typeof optionContractSchema>;

export type OptionSnapshot = z.infer<typeof optionSnapshotSchema>;

export type OptionAggregateExpiry = z.infer<typeof optionAggregateExpirySchema>;

export type OptionAggregate = z.infer<typeof optionAggregateSchema>;

export type OptionOpenInterest = z.infer<typeof optionOpenInterestSchema>;

export type OptionPricePoint = z.infer<typeof optionPricePointSchema>;

export type ForwardReturnHorizon = "15m" | "1h" | "4h" | "1d";

export type ForwardReturnMap = Record<ForwardReturnHorizon, number | null>;

export interface OptionExpirySignals {
    expiry: number;
    baseline: number | null;
    rr25: number | null;
    netDeltaTilt: number | null;
    forwardReturns: ForwardReturnMap | null;
    strikesConsidered: number;
}

export interface BaselineSentimentResult {
    value: number | null;
    strikesConsidered: number;
}

export interface RiskReversalResult {
    rr25: number | null;
    callStrike?: number;
    putStrike?: number;
}

export interface NetDeltaTiltResult {
    value: number | null;
    notionalsConsidered: number;
}
