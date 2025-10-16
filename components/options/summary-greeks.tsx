"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OptionGreeks } from "@/types/options";

interface GreeksPanelProps {
    greeks?: OptionGreeks;
    isLoading?: boolean;
}

const formatGreek = (value: number, digits = 4) => {
    if (!Number.isFinite(value)) return "—";
    return value.toFixed(digits);
};

export const GreeksPanel = ({ greeks, isLoading }: GreeksPanelProps) => {
    const items: Array<{ label: string; value: string; helper: string }> = greeks
        ? [
            {
                label: "Delta",
                value: formatGreek(greeks.delta, 4),
                helper: "Δ price sensitivity",
            },
            {
                label: "Gamma",
                value: formatGreek(greeks.gamma, 5),
                helper: "Δ change rate",
            },
            {
                label: "Theta",
                value: `${formatGreek(greeks.theta, 3)}`,
                helper: "Δ per day",
            },
            {
                label: "Vega",
                value: `${formatGreek(greeks.vega, 3)}`,
                helper: "Δ per 1% vol",
            },
            {
                label: "Rho",
                value: `${formatGreek(greeks.rho, 3)}`,
                helper: "Δ per 1% rates",
            },
        ]
        : [];

    return (
        <Card className="bg-card/60 backdrop-blur">
            <CardHeader>
                <CardTitle className="text-base font-semibold">Sensitivity Profile</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                    Greeks estimate how option prices react to market shifts. Think of them as dials for price, time, volatility, and
                    interest rates.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading && !items.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Skeleton key={index} className="h-20 w-full" />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((item) => (
                            <div key={item.label} className="rounded-lg border border-border/50 bg-muted/10 p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                                <p className="mt-2 text-xl font-semibold text-foreground">{item.value}</p>
                                <p className="text-xs text-muted-foreground">{item.helper}</p>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
