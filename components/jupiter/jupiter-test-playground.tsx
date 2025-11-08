"use client";

import { useActionState, useMemo } from "react";
import { requestJupiterOrder, type JupiterOrderState } from "@/app/_actions/jupiter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { JUPITER_TOKENS } from "@/lib/jupiter/tokens";

const DEFAULT_TAKER = "Enter the wallet that will receive output tokens";

const formatRoutePercent = (value: number) => `${value.toFixed(2)}%`;

const INITIAL_STATE: JupiterOrderState = { status: "idle" };

const JupiterTestPlayground = () => {
    const [state, formAction, pending] = useActionState<JupiterOrderState, FormData>(
        requestJupiterOrder,
        INITIAL_STATE
    );

    const defaultInput = JUPITER_TOKENS[0]!;
    const defaultOutput = JUPITER_TOKENS[3]!;

    const resultBadges = useMemo(() => {
        if (state.status !== "success") return null;
        const badges = [] as Array<{ label: string; value: string }>;
        badges.push({ label: "Request ID", value: state.data.requestId });
        badges.push({ label: "Mode", value: state.data.swapMode });
        if (state.data.slippageBps != null) {
            badges.push({ label: "Slippage", value: `${state.data.slippageBps} bps` });
        }
        if (state.data.expiryTimestamp) {
            const expires = new Date(state.data.expiryTimestamp * 1000).toLocaleString();
            badges.push({ label: "Expires", value: expires });
        }
        return badges;
    }, [state]);

    return (
        <Card className="bg-card/70 backdrop-blur">
            <CardHeader>
                <CardTitle className="text-lg font-semibold">Jupiter Ultra API Sandbox</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                    Submit a quote request using the Ultra order endpoint. The server action validates your inputs,
                    calls Jupiter with your API key, and returns a summary of the prepared transaction.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <form action={formAction} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <fieldset className="space-y-2">
                            <Label htmlFor="inputMint">Input token</Label>
                            <Select name="inputMint" defaultValue={defaultInput.mint}>
                                <SelectTrigger id="inputMint">
                                    <SelectValue placeholder="Select input" />
                                </SelectTrigger>
                                <SelectContent>
                                    {JUPITER_TOKENS.map((token) => (
                                        <SelectItem key={token.mint} value={token.mint}>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{token.symbol}</span>
                                                <span className="text-xs text-muted-foreground">{token.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </fieldset>
                        <fieldset className="space-y-2">
                            <Label htmlFor="outputMint">Output token</Label>
                            <Select name="outputMint" defaultValue={defaultOutput.mint}>
                                <SelectTrigger id="outputMint">
                                    <SelectValue placeholder="Select output" />
                                </SelectTrigger>
                                <SelectContent>
                                    {JUPITER_TOKENS.map((token) => (
                                        <SelectItem key={token.mint} value={token.mint}>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{token.symbol}</span>
                                                <span className="text-xs text-muted-foreground">{token.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </fieldset>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <fieldset className="space-y-2">
                            <Label htmlFor="amount">Amount (human readable)</Label>
                            <Input
                                id="amount"
                                name="amount"
                                defaultValue="0.1"
                                placeholder="e.g. 0.1"
                                required
                                inputMode="decimal"
                            />
                        </fieldset>
                        <fieldset className="space-y-2">
                            <Label htmlFor="taker">Taker wallet address</Label>
                            <Input
                                id="taker"
                                name="taker"
                                placeholder={DEFAULT_TAKER}
                                defaultValue=""
                                minLength={32}
                                maxLength={64}
                                required
                            />
                        </fieldset>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <fieldset className="space-y-2">
                            <Label htmlFor="swapMode">Swap mode</Label>
                            <Select name="swapMode" defaultValue="ExactIn">
                                <SelectTrigger id="swapMode">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ExactIn">ExactIn (fixed input)</SelectItem>
                                    <SelectItem value="ExactOut">ExactOut (fixed output)</SelectItem>
                                </SelectContent>
                            </Select>
                        </fieldset>
                        <fieldset className="space-y-2">
                            <Label htmlFor="slippageBps">Optional slippage (bps)</Label>
                            <Input
                                id="slippageBps"
                                name="slippageBps"
                                placeholder="50"
                                inputMode="numeric"
                                pattern="[0-9]*"
                            />
                        </fieldset>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button type="submit" disabled={pending}>
                            {pending ? "Submitting…" : "Request quote"}
                        </Button>
                    </div>
                </form>

                {state.status === "error" ? (
                    <Card className="border-destructive/40 bg-destructive/10">
                        <CardHeader>
                            <CardTitle className="text-base">Request failed</CardTitle>
                            <CardDescription className="text-sm text-destructive-foreground">
                                {state.message}
                            </CardDescription>
                        </CardHeader>
                    </Card>
                ) : null}

                {state.status === "success" ? (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            {resultBadges?.map((badge) => (
                                <Badge key={badge.label} variant="outline" className="text-xs">
                                    <span className="font-semibold">{badge.label}:</span>&nbsp;{badge.value}
                                </Badge>
                            ))}
                        </div>
                        <Card className="bg-muted/30">
                            <CardHeader>
                                <CardTitle className="text-base">Quote summary</CardTitle>
                                <CardDescription>
                                    Jupiter prepared a transaction containing {state.data.transactionLength} base64 characters. The
                                    preview below shows the first 120 chars for debugging.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm">
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Input amount (raw)</span>
                                        <span className="font-mono text-xs">{state.data.inAmount}</span>
                                    </div>
                                    {state.data.outAmount ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Output amount (raw)</span>
                                            <span className="font-mono text-xs">{state.data.outAmount}</span>
                                        </div>
                                    ) : null}
                                </div>
                                <Separator />
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Route plan</p>
                                    {state.data.routeSummary.length === 0 ? (
                                        <p className="text-xs text-muted-foreground/80">Route details unavailable.</p>
                                    ) : (
                                        <ul className="mt-2 space-y-2 text-xs">
                                            {state.data.routeSummary.map((route, index) => (
                                                <li
                                                    key={`${route.label}-${index}`}
                                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2"
                                                >
                                                    <div>
                                                        <p className="font-medium text-foreground">{route.label}</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {route.inputMint} → {route.outputMint}
                                                        </p>
                                                    </div>
                                                    <span className="font-mono text-xs text-muted-foreground">
                                                        {formatRoutePercent(route.percent)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <Separator />
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transaction preview</p>
                                    <pre className="mt-2 max-h-48 overflow-x-auto rounded-md bg-background/80 p-3 text-[11px] text-muted-foreground">
                                        {state.data.transactionPreview}
                                    </pre>
                                    <p className="mt-2 text-xs text-muted-foreground/80">
                                        Use the <code>/execute</code> endpoint with this signed transaction to broadcast the swap once
                                        you have verified the quote.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
};

export default JupiterTestPlayground;
