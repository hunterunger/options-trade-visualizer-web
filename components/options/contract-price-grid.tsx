"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface GridRow {
    strike: number;
    callPrice?: number | null;
    putPrice?: number | null;
    callSymbol?: string;
    putSymbol?: string;
}

interface ContractPriceGridProps {
    title?: string;
    subtitle?: string;
    rows: GridRow[];
    quote?: string; // e.g., USDT
}

const fmt = (n?: number | null, digits = 2) => (n === null || n === undefined ? "—" : Number(n).toFixed(digits));

const ContractPriceGrid = ({ title = "Contract Price Grid", subtitle, rows, quote = "USDT" }: ContractPriceGridProps) => {
    return (
        <Card className="bg-card/60 backdrop-blur">
            <CardHeader>
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
                {subtitle ? (
                    <CardDescription className="text-xs text-muted-foreground">{subtitle}</CardDescription>
                ) : null}
            </CardHeader>
            <CardContent className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border/40">
                            <TableHead>Strike ({quote})</TableHead>
                            <TableHead>Call Mark</TableHead>
                            <TableHead>Put Mark</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={`${r.strike}`} className="border-border/30">
                                <TableCell className="font-medium">{fmt(r.strike)}</TableCell>
                                <TableCell>{fmt(r.callPrice)}</TableCell>
                                <TableCell>{fmt(r.putPrice)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

export default ContractPriceGrid;
