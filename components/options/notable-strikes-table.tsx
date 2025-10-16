"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { OptionContractSnapshot } from "@/types/options";

interface NotableStrikesTableProps {
    rows: OptionContractSnapshot[];
}

const formatPercent = (value?: number) => {
    if (!value && value !== 0) return "—";
    return `${(value * 100).toFixed(2)}%`;
};

const formatNumber = (value?: number, digits = 2) => {
    if (value === undefined || Number.isNaN(value)) return "—";
    return value.toFixed(digits);
};

export const NotableStrikesTable = ({ rows }: NotableStrikesTableProps) => (
    <Card className="bg-card/60 backdrop-blur">
        <CardHeader>
            <CardTitle className="text-base font-semibold">Highest Open Interest Strikes</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
                Big open interest often signals where traders care most. Treat these strikes as areas where price may pause or accelerate.
            </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow className="border-border/40">
                        <TableHead>Strike</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Last</TableHead>
                        <TableHead>IV</TableHead>
                        <TableHead>Delta</TableHead>
                        <TableHead>Gamma</TableHead>
                        <TableHead>Open Interest</TableHead>
                        <TableHead>Volume</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.contractSymbol} className="border-border/30">
                            <TableCell className="font-medium">${row.strike.toFixed(2)}</TableCell>
                            <TableCell className="capitalize text-muted-foreground">{row.optionType}</TableCell>
                            <TableCell>${formatNumber(row.lastPrice)}</TableCell>
                            <TableCell>{formatPercent(row.impliedVolatility)}</TableCell>
                            <TableCell>{formatNumber(row.delta)}</TableCell>
                            <TableCell>{formatNumber(row.gamma, 4)}</TableCell>
                            <TableCell>{row.openInterest?.toLocaleString() ?? "—"}</TableCell>
                            <TableCell>{row.volume?.toLocaleString() ?? "—"}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
);
