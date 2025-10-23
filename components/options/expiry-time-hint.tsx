"use client";

interface ExpiryTimeHintProps {
    expiryMs: number;
}

const format = (d: Date, timeZone?: string) =>
    new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZoneName: "short",
    }).format(d);

const ExpiryTimeHint = ({ expiryMs }: ExpiryTimeHintProps) => {
    const d = new Date(expiryMs);
    const utc = format(d, "UTC");
    const local = format(d);
    return (
        <p className="text-xs text-muted-foreground">
            Expires: <span className="font-medium text-foreground">{utc}</span> • Local: <span className="font-medium text-foreground">{local}</span>
        </p>
    );
};

export default ExpiryTimeHint;
