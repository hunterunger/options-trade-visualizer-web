"use server";

import { z } from "zod";
import { getTokenConfig } from "@/lib/jupiter/tokens";

const ORDER_SCHEMA = z.object({
    inputMint: z.string().min(32).max(64),
    outputMint: z.string().min(32).max(64),
    taker: z.string().min(32).max(64),
    amount: z.string().min(1),
    swapMode: z.enum(["ExactIn", "ExactOut"]),
    slippageBps: z.coerce.number().min(1).max(10_000).optional(),
});

const API_BASE_URL = "https://api.jup.ag/ultra/v1";

const mapAmountToBaseUnits = (value: string, decimals: number): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
    const [wholePart, fractionPart = ""] = trimmed.split(".");
    if (fractionPart.length > decimals) {
        return null;
    }
    const paddedFraction = fractionPart.padEnd(decimals, "0");
    const fullNumber = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "");
    return fullNumber.length ? fullNumber : "0";
};

export type JupiterOrderSuccess = {
    requestId: string;
    swapMode: "ExactIn" | "ExactOut";
    inAmount: string;
    outAmount: string | null;
    slippageBps: number | null;
    expiryTimestamp: number | null;
    routeSummary: Array<{
        label: string;
        inputMint: string;
        outputMint: string;
        percent: number;
    }>;
    transactionLength: number;
    transactionPreview: string;
};

export type JupiterOrderState =
    | { status: "idle" }
    | { status: "error"; message: string }
    | { status: "success"; data: JupiterOrderSuccess };

export const requestJupiterOrder = async (
    _prevState: JupiterOrderState,
    formData: FormData
): Promise<JupiterOrderState> => {
    const raw = Object.fromEntries(formData.entries());
    const parseResult = ORDER_SCHEMA.safeParse(raw);
    if (!parseResult.success) {
        return {
            status: "error",
            message: "Invalid form input. Check mint addresses, decimals, and amount.",
        };
    }

    const { inputMint, outputMint, taker, amount, swapMode, slippageBps } = parseResult.data;

    const inputTokenConfig = getTokenConfig(inputMint);
    if (!inputTokenConfig) {
        return {
            status: "error",
            message: "Unsupported input token mint. Update TOKEN_CONFIGS on the test page to include this mint.",
        };
    }

    const outputTokenConfig = getTokenConfig(outputMint);
    if (!outputTokenConfig) {
        return {
            status: "error",
            message: "Unsupported output token mint. Update TOKEN_CONFIGS on the test page to include this mint.",
        };
    }

    const amountInBaseUnits = mapAmountToBaseUnits(amount, inputTokenConfig.decimals);
    if (amountInBaseUnits == null) {
        return {
            status: "error",
            message: `Amount must be a numeric value with up to ${inputTokenConfig.decimals} decimal places.`,
        };
    }
    if (amountInBaseUnits === "0") {
        return {
            status: "error",
            message: "Amount must be greater than zero.",
        };
    }

    const apiKey = process.env.JUPITER_API_KEY;
    if (!apiKey) {
        return {
            status: "error",
            message: "JUPITER_API_KEY is not configured in the environment.",
        };
    }

    const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amountInBaseUnits,
        taker,
        swapMode,
    });
    if (slippageBps) {
        params.set("slippageBps", String(slippageBps));
    }

    const requestUrl = `${API_BASE_URL}/order?${params.toString()}`;

    try {
        const response = await fetch(requestUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const message = payload?.message ?? payload?.error ?? `Order request failed (${response.status}).`;
            return { status: "error", message };
        }

        const data = await response.json();
        if (!data?.transaction || !data?.requestId) {
            return {
                status: "error",
                message: "Unexpected response from Jupiter. Missing transaction payload.",
            };
        }

        const transactionBase64: string = data.transaction;
        const transactionPreview = transactionBase64.slice(0, 120);

        const routeSummary = Array.isArray(data.routePlan)
            ? data.routePlan.map((entry: any) => ({
                label: entry.marketMeta?.label ?? entry.marketLabel ?? "Unknown",
                inputMint: entry.inputMint ?? "",
                outputMint: entry.outputMint ?? "",
                percent: typeof entry.percent === "number" ? entry.percent : 0,
            }))
            : [];

        const result: JupiterOrderSuccess = {
            requestId: data.requestId,
            swapMode,
            inAmount: data.inAmount ?? amountInBaseUnits,
            outAmount: data.outAmount ?? null,
            slippageBps: typeof data.slippageBps === "number" ? data.slippageBps : slippageBps ?? null,
            expiryTimestamp: data.expiryTimestamp ?? null,
            routeSummary,
            transactionLength: transactionBase64.length,
            transactionPreview,
        };

        return { status: "success", data: result };
    } catch (error) {
        console.error("Jupiter order request failed", error);
        return {
            status: "error",
            message: "Failed to reach Jupiter Ultra API. Check network connectivity and API key permissions.",
        };
    }
};
