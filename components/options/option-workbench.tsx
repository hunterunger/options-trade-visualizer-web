"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { analyzeOptionTrade, suggestOptionDefaults } from "@/app/_actions/option-analysis";
import type { OptionAnalysisActionResult } from "@/app/_actions/option-analysis";
import type { OptionAnalysisInput } from "@/types/options";
import { optionAnalysisSchema, type OptionAnalysisSchema } from "@/lib/validations/options";
import { buildOptionAnalytics } from "@/lib/calculations/black-scholes";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { LucideArrowUpRight, LucideTrendingUp, LucideZap } from "lucide-react";
import { ProfitChart } from "@/components/options/profit-chart";
import { GreeksPanel } from "@/components/options/summary-greeks";
import { VolatilitySmileChart } from "@/components/options/volatility-smile-chart";
import { OpenInterestChart } from "@/components/options/open-interest-chart";
import { NotableStrikesTable } from "@/components/options/notable-strikes-table";

interface OptionWorkbenchProps {
    initialResult?: OptionAnalysisActionResult;
}

const today = () => new Date();
const nextMonthlyExpiry = () => {
    const base = today();
    const month = base.getMonth();
    const year = base.getFullYear();
    const thirdFriday = new Date(year, month, 1);
    thirdFriday.setMonth(month + 1, 1);
    while (thirdFriday.getDay() !== 5 || thirdFriday.getDate() < 15) {
        thirdFriday.setDate(thirdFriday.getDate() + 1);
    }
    return format(thirdFriday, "yyyy-MM-dd");
};

const defaultValues: OptionAnalysisSchema = {
    symbol: "AAPL",
    expiration: nextMonthlyExpiry(),
    optionType: "call",
    position: "long",
    strike: 190,
    premium: undefined,
    quantity: 1,
    interestRate: 0.045,
    dividendYield: 0.005,
    volatility: undefined,
    underlyingOverride: undefined,
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

const parseOptionalNumber = (value: unknown): number | undefined => {
    if (value === "" || value === null || value === undefined) {
        return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
};

const moneynessLabels: Record<"ITM" | "ATM" | "OTM", string> = {
    ITM: "In the money",
    ATM: "At the money",
    OTM: "Out of the money",
};

const moneynessDescriptions: Record<"ITM" | "ATM" | "OTM", string> = {
    ITM: "Spot is beyond the strike, so intrinsic value already exists.",
    ATM: "Strike and spot are nearly identical—pricing is mostly time value.",
    OTM: "Needs a move past the strike before intrinsic value appears.",
};

const LIVE_UPDATE_FIELDS = new Set<keyof OptionAnalysisSchema>([
    "strike",
    "premium",
    "quantity",
    "volatility",
    "underlyingOverride",
    "optionType",
    "position",
    "interestRate",
    "dividendYield",
]);

export const OptionWorkbench = ({ initialResult }: OptionWorkbenchProps) => {
    const form = useForm<OptionAnalysisSchema>({
        resolver: zodResolver(optionAnalysisSchema),
        defaultValues,
    });

    const [result, setResult] = useState<OptionAnalysisActionResult | undefined>(initialResult);
    const [isAnalyzing, startAnalyze] = useTransition();
    const [isPrefilling, startPrefill] = useTransition();
    const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
    const [prefillError, setPrefillError] = useState<string | null>(null);
    const serverResultRef = useRef<OptionAnalysisActionResult | undefined>(
        initialResult?.success ? initialResult : undefined,
    );
    const liveUpdateTimeoutRef = useRef<number | null>(null);
    const lastSuggestedSymbol = useRef<string | null>(initialResult?.data?.quote.symbol ?? defaultValues.symbol);
    const symbolWatcher = form.watch("symbol");
    const [watchedStrike, watchedPremium, watchedQuantity, watchedVolatility, watchedOverride] = form.watch([
        "strike",
        "premium",
        "quantity",
        "volatility",
        "underlyingOverride",
    ]);

    const runAnalysis = useCallback(
        (values: OptionAnalysisSchema) => {
            const formData = new FormData();
            Object.entries(values).forEach(([key, rawValue]) => {
                if (rawValue === undefined || rawValue === null || rawValue === "") return;
                formData.append(key, String(rawValue));
            });

            startAnalyze(async () => {
                const response = await analyzeOptionTrade(formData);
                if (response.success && response.data?.resolvedExpiration) {
                    const serverExpiration = response.data.resolvedExpiration;
                    if (serverExpiration && serverExpiration !== form.getValues("expiration")) {
                        form.setValue("expiration", serverExpiration, {
                            shouldDirty: false,
                            shouldTouch: false,
                            shouldValidate: false,
                        });
                    }
                }
                if (response.success) {
                    serverResultRef.current = response;
                }
                setResult(response);
            });
        },
        [form, startAnalyze],
    );

    const recalcAnalytics = useCallback(
        (values: OptionAnalysisSchema) => {
            const base = serverResultRef.current;
            if (!base?.success || !base.data) {
                return;
            }

            const fallbackPremium =
                base.data.contract?.lastPrice ??
                base.data.analytics.premiumPerContract / base.data.analytics.contractSize;
            const fallbackVolatility = base.data.contract?.impliedVolatility ?? 0.2;
            const fallbackQuantity = base.data.analytics.contracts ?? defaultValues.quantity;

            const strike = Number(values.strike);
            if (!Number.isFinite(strike)) {
                return;
            }

            const quantityRaw = parseOptionalNumber(values.quantity) ?? fallbackQuantity;
            const quantity = Math.max(1, Math.round(quantityRaw));
            const premium = parseOptionalNumber(values.premium) ?? fallbackPremium;
            const interestRate = parseOptionalNumber(values.interestRate) ?? values.interestRate ?? defaultValues.interestRate;
            const dividendYield =
                parseOptionalNumber(values.dividendYield) ?? values.dividendYield ?? defaultValues.dividendYield;
            const volatility = parseOptionalNumber(values.volatility) ?? fallbackVolatility;
            const underlyingOverride = parseOptionalNumber(values.underlyingOverride);
            const underlyingPrice = underlyingOverride ?? base.data.quote.price;

            const analysisInput: OptionAnalysisInput = {
                symbol: values.symbol,
                expiration: values.expiration,
                optionType: values.optionType,
                position: values.position,
                strike,
                premium,
                quantity,
                interestRate: Number(interestRate),
                dividendYield: Number(dividendYield),
                volatility,
                underlyingOverride,
            } satisfies OptionAnalysisSchema;

            const analytics = buildOptionAnalytics(
                analysisInput,
                underlyingPrice,
                volatility,
                premium,
            );

            setResult((prev) => {
                if (!prev?.success || !prev.data) {
                    return prev;
                }

                return {
                    ...prev,
                    data: {
                        ...prev.data,
                        analytics,
                    },
                };
            });
        },
        [],
    );

    const submitHandler = form.handleSubmit(runAnalysis);

    useEffect(() => {
        if (!initialResult && !result) {
            runAnalysis(form.getValues());
        }
    }, [form, initialResult, result, runAnalysis]);

    useEffect(() => {
        const normalized = symbolWatcher?.trim().toUpperCase();
        if (!normalized) {
            setPrefillMessage(null);
            setPrefillError(null);
            return;
        }

        if (normalized === lastSuggestedSymbol.current) {
            return;
        }

        if (!/^[A-Z\.\-]{1,8}$/.test(normalized)) {
            setPrefillError("Use letters, periods, or dashes for ticker symbols.");
            setPrefillMessage(null);
            return;
        }

        const timeout = window.setTimeout(() => {
            setPrefillError(null);
            startPrefill(async () => {
                const response = await suggestOptionDefaults(normalized);

                if (!response.success || !response.data) {
                    setPrefillError(response.message ?? "Auto-fill unavailable.");
                    setPrefillMessage(null);
                    return;
                }

                const suggestion = response.data;
                lastSuggestedSymbol.current = suggestion.symbol;
                setPrefillError(null);
                setPrefillMessage(
                    `Auto-filled from ${suggestion.contractSymbol ?? "nearest contract"} expiring ${suggestion.expiration}. Analysis refreshed.`,
                );

                const current = form.getValues();
                const nextValues: OptionAnalysisSchema = {
                    ...current,
                    symbol: suggestion.symbol,
                    expiration: suggestion.expiration ?? current.expiration,
                    optionType: suggestion.optionType ?? current.optionType,
                    position: current.position,
                    strike: suggestion.strike ?? current.strike,
                    premium: suggestion.premium ?? undefined,
                    volatility: suggestion.impliedVolatility ?? undefined,
                    underlyingOverride: suggestion.underlyingPrice ?? current.underlyingOverride,
                };

                form.reset(nextValues, {
                    keepDirty: false,
                    keepTouched: false,
                    keepSubmitCount: true,
                    keepErrors: true,
                });

                runAnalysis(nextValues);
            });
        }, 600);

        return () => window.clearTimeout(timeout);
    }, [form, runAnalysis, startPrefill, symbolWatcher]);

    useEffect(() => {
        const subscription = form.watch((values, { name }) => {
            if (!name || !LIVE_UPDATE_FIELDS.has(name as keyof OptionAnalysisSchema)) {
                return;
            }

            if (liveUpdateTimeoutRef.current !== null) {
                window.clearTimeout(liveUpdateTimeoutRef.current);
            }

            liveUpdateTimeoutRef.current = window.setTimeout(() => {
                recalcAnalytics(values as OptionAnalysisSchema);
            }, 200);
        });

        return () => {
            subscription.unsubscribe();
            if (liveUpdateTimeoutRef.current !== null) {
                window.clearTimeout(liveUpdateTimeoutRef.current);
            }
        };
    }, [form, recalcAnalytics]);

    const analytics = result?.data?.analytics;
    const quote = result?.data?.quote;
    const contract = result?.data?.contract;

    const changeColor = quote && quote.change >= 0 ? "text-success" : "text-destructive";

    const analyticsCards = [
        {
            title: "Break-even",
            value: analytics ? `$${analytics.breakEven.toFixed(2)}` : "—",
            icon: <LucideZap className="h-4 w-4" />,
            helper: "Price target where gains offset the premium paid.",
        },
        {
            title: "Prob. ITM",
            value: analytics ? `${(analytics.probabilityInTheMoney * 100).toFixed(1)}%` : "—",
            icon: <LucideTrendingUp className="h-4 w-4" />,
            helper: "Likelihood of finishing in the money at expiration.",
        },
        {
            title: "Expected Move",
            value: analytics ? `$${analytics.expectedMove.toFixed(2)}` : "—",
            icon: <LucideArrowUpRight className="h-4 w-4" />,
            helper: "One-standard-deviation move implied by market volatility.",
        },
    ];

    return (
        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
            <form onSubmit={submitHandler} className="space-y-6">
                <Card className="bg-card/60 backdrop-blur">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between text-base font-semibold">
                            Trade Parameters
                            <Badge variant="outline" className="bg-highlight/10 text-highlight">
                                Builder
                            </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                            Start with a ticker and we'll suggest the most active contract. Adjust any field and rerun analysis to see
                            updated payoff visuals.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="symbol">Underlying</Label>
                            <Input id="symbol" placeholder="AAPL" {...form.register("symbol")} />
                            {form.formState.errors.symbol && (
                                <p className="text-sm text-destructive">{form.formState.errors.symbol.message}</p>
                            )}
                            {isPrefilling && (
                                <p className="text-xs text-muted-foreground">Looking up the most liquid option series…</p>
                            )}
                            {prefillMessage && !isPrefilling && (
                                <p className="text-xs text-muted-foreground">{prefillMessage}</p>
                            )}
                            {prefillError && !isPrefilling && (
                                <p className="text-xs text-destructive">{prefillError}</p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="expiration">Expiration</Label>
                                <Input id="expiration" type="date" {...form.register("expiration")} />
                                {form.formState.errors.expiration && (
                                    <p className="text-sm text-destructive">{form.formState.errors.expiration.message}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Option Type</Label>
                                <Select
                                    value={form.watch("optionType")}
                                    onValueChange={(value) => form.setValue("optionType", value as "call" | "put")}
                                >
                                    <SelectTrigger id="optionType">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="call">Call</SelectItem>
                                        <SelectItem value="put">Put</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Position</Label>
                                <Select
                                    value={form.watch("position")}
                                    onValueChange={(value) => form.setValue("position", value as "long" | "short")}
                                >
                                    <SelectTrigger id="position">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="long">Long</SelectItem>
                                        <SelectItem value="short">Short</SelectItem>
                                    </SelectContent>
                                </Select>
                                {form.formState.errors.position && (
                                    <p className="text-sm text-destructive">{form.formState.errors.position.message}</p>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Controller
                                name="strike"
                                control={form.control}
                                render={({ field }) => {
                                    const referencePrice = analytics?.underlyingPrice ?? quote?.price ?? defaultValues.strike;
                                    const currentValue =
                                        typeof field.value === "number"
                                            ? field.value
                                            : Number(field.value ?? referencePrice) || referencePrice;
                                    const minStrike = Math.max(referencePrice * 0.5, 0.5);
                                    const maxStrike = Math.max(referencePrice * 1.5, minStrike + 1);

                                    return (
                                        <div className="space-y-2">
                                            <Label htmlFor="strike">Strike</Label>
                                            <div className="flex items-center gap-3">
                                                <Slider
                                                    value={[Number(currentValue.toFixed(2))]}
                                                    min={Number(minStrike.toFixed(2))}
                                                    max={Number(maxStrike.toFixed(2))}
                                                    step={0.5}
                                                    className="flex-1"
                                                    onValueChange={(vals) => {
                                                        const numeric = Number(vals[0]);
                                                        field.onChange(Number(numeric.toFixed(2)));
                                                    }}
                                                />
                                                <Input
                                                    id="strike"
                                                    type="number"
                                                    step="0.01"
                                                    className="w-24"
                                                    value={field.value ?? ""}
                                                    onChange={(event) => {
                                                        const inputValue = event.target.value;
                                                        if (inputValue === "") {
                                                            field.onChange("");
                                                        } else {
                                                            field.onChange(Number(inputValue));
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <Controller
                                name="premium"
                                control={form.control}
                                render={({ field }) => {
                                    const baseData = serverResultRef.current?.data;
                                    const fallbackPremium = baseData
                                        ? baseData.contract?.lastPrice ??
                                        baseData.analytics.premiumPerContract / baseData.analytics.contractSize
                                        : defaultValues.strike * 0.1;
                                    const referencePrice = analytics?.underlyingPrice ?? quote?.price ?? fallbackPremium;
                                    const currentValue =
                                        typeof field.value === "number"
                                            ? field.value
                                            : Number(field.value ?? fallbackPremium) || fallbackPremium;
                                    const minPremium = 0;
                                    const maxPremium = Math.max(referencePrice * 1.5, currentValue * 2, fallbackPremium * 2, 1);

                                    return (
                                        <div className="space-y-2">
                                            <Label htmlFor="premium">Premium (optional)</Label>
                                            <div className="flex items-center gap-3">
                                                <Slider
                                                    value={[Number(currentValue.toFixed(2))]}
                                                    min={minPremium}
                                                    max={Number(maxPremium.toFixed(2))}
                                                    step={0.05}
                                                    className="flex-1"
                                                    onValueChange={(vals) => {
                                                        const numeric = Math.max(Number(vals[0]), 0);
                                                        field.onChange(Number(numeric.toFixed(2)));
                                                    }}
                                                />
                                                <Input
                                                    id="premium"
                                                    type="number"
                                                    step="0.01"
                                                    className="w-24"
                                                    value={field.value ?? ""}
                                                    onChange={(event) => {
                                                        const inputValue = event.target.value;
                                                        if (inputValue === "") {
                                                            field.onChange("");
                                                        } else {
                                                            field.onChange(Number(inputValue));
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Controller
                                name="quantity"
                                control={form.control}
                                render={({ field }) => {
                                    const currentValue =
                                        typeof field.value === "number"
                                            ? field.value
                                            : Number(field.value ?? defaultValues.quantity) || defaultValues.quantity;
                                    const minQuantity = 1;
                                    const maxQuantity = Math.max(currentValue, defaultValues.quantity * 5);

                                    return (
                                        <div className="space-y-2">
                                            <Label htmlFor="quantity">Contracts</Label>
                                            <div className="flex items-center gap-3">
                                                <Slider
                                                    value={[currentValue]}
                                                    min={minQuantity}
                                                    max={maxQuantity}
                                                    step={1}
                                                    className="flex-1"
                                                    onValueChange={(vals) => {
                                                        const numeric = Math.round(Number(vals[0]));
                                                        field.onChange(Math.max(1, numeric));
                                                    }}
                                                />
                                                <Input
                                                    id="quantity"
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    className="w-20"
                                                    value={field.value ?? ""}
                                                    onChange={(event) => {
                                                        const inputValue = event.target.value;
                                                        if (inputValue === "") {
                                                            field.onChange("");
                                                        } else {
                                                            const numeric = Math.max(1, Math.round(Number(inputValue)));
                                                            field.onChange(numeric);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <div className="space-y-2">
                                <Label htmlFor="underlyingOverride">Override Spot (optional)</Label>
                                <Input
                                    id="underlyingOverride"
                                    type="number"
                                    step="0.01"
                                    {...form.register("underlyingOverride")}
                                />
                            </div>
                        </div>
                        <Separator className="bg-border/60" />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="interestRate">Risk-Free Rate</Label>
                                <Input id="interestRate" type="number" step="0.001" {...form.register("interestRate")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="dividendYield">Dividend Yield</Label>
                                <Input id="dividendYield" type="number" step="0.001" {...form.register("dividendYield")} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="volatility">Implied Volatility (optional)</Label>
                            <Input
                                id="volatility"
                                type="number"
                                step="0.0001"
                                inputMode="decimal"
                                min={0}
                                {...form.register("volatility")}
                            />
                        </div>
                        {result?.errors && (
                            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                                {Object.values(result.errors)
                                    .flat()
                                    .map((error) => (
                                        <p key={error}>{error}</p>
                                    ))}
                            </div>
                        )}
                        {result?.message && !result.success && !result.errors && (
                            <p className="text-sm text-warning">{result.message}</p>
                        )}
                        <Button type="submit" className="w-full" disabled={isAnalyzing}>
                            {isAnalyzing ? "Crunching..." : "Run Analysis"}
                        </Button>
                    </CardContent>
                </Card>
                {quote && (
                    <Card className="bg-card/60 backdrop-blur">
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">Live Snapshot</CardTitle>
                            <CardDescription className="text-xs text-muted-foreground">
                                We surface the latest quote and the contract closest to your selections so you know what the market is
                                trading.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex items-baseline justify-between">
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Symbol</p>
                                    <p className="text-lg font-semibold tracking-tight">{quote.symbol}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs uppercase text-muted-foreground">Last</p>
                                    <p className="text-lg font-semibold tracking-tight">${quote.price.toFixed(2)}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs uppercase text-muted-foreground">Session Change</span>
                                <span className={cn("font-medium", changeColor)}>
                                    {quote.change >= 0 ? "+" : ""}
                                    {quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                                </span>
                            </div>
                            {contract && (
                                <div className="rounded-md border border-border/40 bg-muted/20 p-3">
                                    <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                                        <span>Closest Contract</span>
                                        <Badge variant="outline" className="bg-accent/10 text-accent">
                                            {contract.optionType === "call" ? "Call" : "Put"}
                                        </Badge>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-muted-foreground">Strike</p>
                                            <p className="font-medium">${contract.strike.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Premium</p>
                                            <p className="font-medium">${contract.lastPrice.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Implied Vol</p>
                                            <p className="font-medium">
                                                {contract.impliedVolatility ? `${(contract.impliedVolatility * 100).toFixed(2)}%` : "—"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Open Interest</p>
                                            <p className="font-medium">{contract.openInterest ?? "—"}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {analytics && (
                                <div className="rounded-md border border-border/40 bg-muted/20 p-3">
                                    <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                                        <span>Moneyness Snapshot</span>
                                        <Badge variant="outline" className="bg-highlight/10 text-highlight">
                                            {analytics.moneyness}
                                        </Badge>
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-foreground">
                                        {moneynessLabels[analytics.moneyness]}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {moneynessDescriptions[analytics.moneyness]}
                                    </p>
                                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                                        <div>
                                            <p className="text-muted-foreground">Intrinsic value</p>
                                            <p className="font-medium">{formatCurrency(analytics.intrinsicValueTotal)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Per contract: {formatCurrency(analytics.intrinsicValuePerContract)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Time value</p>
                                            <p className="font-medium">{formatCurrency(analytics.timeValueTotal)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Per contract: {formatCurrency(analytics.timeValuePerContract)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">
                                                {analytics.position === "short" ? "Premium credit" : "Premium outlay"}
                                            </p>
                                            <p className="font-medium">
                                                {formatCurrency(
                                                    analytics.position === "short"
                                                        ? Math.abs(analytics.positionPremium)
                                                        : analytics.positionPremium,
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {analytics.contracts} × {analytics.contractSize} shares · {" "}
                                                {analytics.position === "short" ? "credit received" : "capital required"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </form>

            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                    {analyticsCards.map((item) => (
                        <AnalyticsCard
                            key={item.title}
                            title={item.title}
                            value={item.value}
                            icon={item.icon}
                            helper={item.helper}
                        />
                    ))}
                </div>

                <Tabs defaultValue="payoff" className="space-y-4">
                    <TabsList className="bg-muted/30">
                        <TabsTrigger value="payoff">Payoff</TabsTrigger>
                        <TabsTrigger value="greeks">Greeks</TabsTrigger>
                        <TabsTrigger value="volatility">Volatility</TabsTrigger>
                        <TabsTrigger value="interest">Open Interest</TabsTrigger>
                    </TabsList>
                    <TabsContent value="payoff" className="space-y-4">
                        <Card className="bg-card/60 backdrop-blur">
                            <CardHeader>
                                <CardTitle className="text-base font-semibold">Expiration Payoff</CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    Visualizes profit or loss per underlying price at expiration. Positive territory sits above the
                                    horizontal line. The dashed vertical line marks breakeven; the dotted line marks today's spot.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {analytics ? (
                                    <ProfitChart
                                        data={analytics.payoffAtExpiration}
                                        breakEven={analytics.breakEven}
                                        underlyingPrice={analytics.underlyingPrice}
                                    />
                                ) : (
                                    <Skeleton className="h-64 w-full" />
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="greeks">
                        <GreeksPanel greeks={analytics?.greeks} isLoading={isAnalyzing && !analytics} />
                    </TabsContent>
                    <TabsContent value="volatility">
                        <Card className="bg-card/60 backdrop-blur">
                            <CardHeader>
                                <CardTitle className="text-base font-semibold">Volatility Smile</CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    Compares implied vol across strikes so you can spot rich or cheap areas of the chain while
                                    overlaying recent realized volatility for context.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {result?.data?.volatilitySmile?.length ? (
                                    <>
                                        <VolatilitySmileChart
                                            data={result.data.volatilitySmile}
                                            realizedVolatility={result.data.realizedVolatility?.value}
                                        />
                                        {result.data.realizedVolatility ? (
                                            <p className="mt-3 text-xs text-muted-foreground">
                                                Realized vol ({result.data.realizedVolatility.window}-session sample):
                                                {" "}
                                                {formatPercent(result.data.realizedVolatility.value)}
                                            </p>
                                        ) : null}
                                    </>
                                ) : (
                                    <Skeleton className="h-64 w-full" />
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="interest">
                        <Card className="bg-card/60 backdrop-blur">
                            <CardHeader>
                                <CardTitle className="text-base font-semibold">Open Interest Distribution</CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    Highlights where contracts are concentrated so you can gauge liquidity and potential pin levels.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {result?.data?.openInterest?.length ? (
                                    <OpenInterestChart data={result.data.openInterest} />
                                ) : (
                                    <Skeleton className="h-64 w-full" />
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {result?.data?.notableStrikes?.length ? (
                    <NotableStrikesTable rows={result.data.notableStrikes} />
                ) : null}
            </div>
        </div>
    );
};

interface AnalyticsCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    helper?: string;
}

const AnalyticsCard = ({ title, value, icon, helper }: AnalyticsCardProps) => (
    <Card className="bg-card/60 backdrop-blur">
        <CardContent className="flex items-center justify-between gap-4 py-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
                <p className="mt-2 text-lg font-semibold">{value}</p>
                {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                {icon}
            </span>
        </CardContent>
    </Card>
);
