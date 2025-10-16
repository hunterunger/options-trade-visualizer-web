import { z } from "zod";

export const optionAnalysisSchema = z.object({
    symbol: z
        .string()
        .min(1, "Ticker is required")
        .regex(/^[A-Za-z\.\-]{1,8}$/i, "Ticker must be alphanumeric"),
    expiration: z
        .string()
        .min(1, "Expiration is required")
        .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date"),
    optionType: z.enum(["call", "put"]),
    position: z.enum(["long", "short"]),
    strike: z.coerce
        .number({ invalid_type_error: "Strike must be a number" })
        .positive("Strike must be positive"),
    premium: z
        .union([
            z.coerce.number({ invalid_type_error: "Premium must be a number" }),
            z.literal("")
                .transform(() => undefined)
                .optional(),
        ])
        .optional(),
    quantity: z.coerce
        .number({ invalid_type_error: "Contracts must be numeric" })
        .int()
        .min(1, "At least one contract"),
    interestRate: z.coerce
        .number({ invalid_type_error: "Interest rate must be numeric" })
        .min(0, "Rate cannot be negative")
        .max(0.25, "Rate seems too high"),
    dividendYield: z.coerce
        .number({ invalid_type_error: "Dividend yield must be numeric" })
        .min(0, "Yield cannot be negative")
        .max(0.2, "Yield seems too high"),
    volatility: z
        .union([
            z.coerce.number({ invalid_type_error: "Volatility must be numeric" }),
            z.literal("")
                .transform(() => undefined)
                .optional(),
        ])
        .optional(),
    underlyingOverride: z
        .union([
            z.coerce.number({ invalid_type_error: "Price must be numeric" }),
            z.literal("")
                .transform(() => undefined)
                .optional(),
        ])
        .optional(),
});

export type OptionAnalysisSchema = z.infer<typeof optionAnalysisSchema>;
