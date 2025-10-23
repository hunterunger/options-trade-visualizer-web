"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UnderlyingSelectProps {
    options: string[]; // e.g., ["BTCUSDT","ETHUSDT"]
}

const UnderlyingSelect = ({ options }: UnderlyingSelectProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();

    const current = search.get("underlying") ?? options[0] ?? "BTCUSDT";

    const onChange = useCallback(
        (value: string) => {
            const params = new URLSearchParams(search.toString());
            params.set("underlying", value);
            // Reset expiry when changing underlying, it may not exist on the new one
            params.delete("expiry");
            router.push(`${pathname}?${params.toString()}`);
        },
        [router, pathname, search]
    );

    const opts = useMemo(() => Array.from(new Set(options)).sort(), [options]);

    return (
        <Select value={current} onValueChange={onChange}>
            <SelectTrigger className="w-40">
                <SelectValue placeholder="Underlying" />
            </SelectTrigger>
            <SelectContent>
                {opts.map((u) => (
                    <SelectItem key={u} value={u}>
                        {u}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

export default UnderlyingSelect;
