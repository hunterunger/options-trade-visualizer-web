import { z } from "zod";

export const optionContractSchema = z.object({
    symbol: z.string(),
    underlying: z.string(),
    expiryDate: z.number(),
    strikePrice: z.number(),
    side: z.enum(["CALL", "PUT"]),
    unit: z.number().optional(),
    markPrice: z.number().nullable(),
    bidIV: z.number().nullable().optional(),
    askIV: z.number().nullable().optional(),
    markIV: z.number().nullable().optional(),
    delta: z.number().nullable().optional(),
    theta: z.number().nullable().optional(),
    gamma: z.number().nullable().optional(),
    vega: z.number().nullable().optional(),
});

export const optionSnapshotSchema = z.object({
    underlying: z.string(),
    createdAt: z.number(),
    indexPrice: z.number(),
    expiries: z.array(z.number()),
    symbols: z.array(optionContractSchema),
});

export const optionAggregateExpirySchema = z.object({
    expiry: z.number(),
    baseline: z.number().nullable(),
    rr25: z.number().nullable(),
    price: z.number().nullable(),
    strikesConsidered: z.number().optional(),
});

export const optionAggregateSchema = z.object({
    underlying: z.string(),
    createdAt: z.number(),
    indexPrice: z.number().nullable(),
    expiries: z.array(optionAggregateExpirySchema),
    metadata: z
        .object({
            version: z.number(),
            sourceSnapshotId: z.string().optional(),
        })
        .optional(),
});

export const optionOpenInterestSchema = z.object({
    symbol: z.string(),
    openInterest: z.number(),
});

export const optionPricePointSchema = z.object({
    timestamp: z.number(),
    price: z.number(),
});
