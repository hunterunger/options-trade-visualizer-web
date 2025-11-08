export interface JupiterTokenConfig {
    mint: string;
    symbol: string;
    decimals: number;
    description: string;
}

export const JUPITER_TOKENS: JupiterTokenConfig[] = [
    {
        mint: "So11111111111111111111111111111111111111112",
        symbol: "wSOL",
        decimals: 9,
        description: "Wrapped SOL (native gas token)",
    },
    {
        mint: "Es9vMFrzaCER21fdAyhKux97r7QLm5Qg1GKeo7GXhVWb",
        symbol: "USDT",
        decimals: 6,
        description: "Tether USD on Solana",
    },
    {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        symbol: "USDC",
        decimals: 6,
        description: "USD Coin on Solana",
    },
    {
        mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
        symbol: "WBTC",
        decimals: 8,
        description: "Wrapped Bitcoin (Solana)",
    },
];

export const getTokenConfig = (mint: string): JupiterTokenConfig | undefined =>
    JUPITER_TOKENS.find((token) => token.mint === mint);
