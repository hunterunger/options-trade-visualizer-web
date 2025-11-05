import {
    runAggregateBackfill,
    type AggregateBackfillOptions,
} from "@/lib/backfill/aggregate-backfill";

interface CliOptions {
    underlying?: string;
    limit?: number;
    force?: boolean;
    dryRun?: boolean;
}

const parseArgs = (): CliOptions => {
    const options: CliOptions = {};
    for (const arg of process.argv.slice(2)) {
        if (arg === "--force") options.force = true;
        else if (arg === "--dry-run") options.dryRun = true;
        else if (arg.startsWith("--underlying=")) options.underlying = arg.split("=")[1]?.toUpperCase();
        else if (arg.startsWith("--limit=")) {
            const value = Number(arg.split("=")[1]);
            if (Number.isFinite(value) && value > 0) options.limit = value;
        }
    }
    return options;
};

const main = async () => {
    const options = parseArgs();
    const backfillOptions: AggregateBackfillOptions = {
        underlying: options.underlying,
        limit: options.limit,
        force: options.force,
        dryRun: options.dryRun,
    };

    await runAggregateBackfill(backfillOptions, {
        info: (message) => console.info(message),
    });
};

void main().catch((error) => {
    console.error("Backfill failed", error);
    process.exitCode = 1;
});
