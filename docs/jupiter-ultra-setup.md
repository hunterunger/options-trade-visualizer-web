# Jupiter Ultra Sandbox Setup Guide

This guide walks you through configuring the repository, securing credentials, and using the `/jupiter-ultra-test` playground to request quotes from Jupiter's Ultra order endpoint. Follow each section in order; the early steps unblock everything that follows.

## Prerequisites

- Node.js 20 LTS (18.18+ works, 20.x recommended for Next.js 15)
- Package manager: `pnpm` (preferred) or `npm`
- A Solana mainnet wallet you control (Phantom, Backpack, or CLI keypair)
- Access to the [Jupiter developer portal](https://station.jup.ag/) to mint an Ultra API key
- Optional but helpful: Solana CLI (`solana-keygen`, `solana config get`) for inspecting balances

## 1. Install dependencies

1. Clone the repository (skip if already local).
2. From the project root, install packages:
   ```fish
   pnpm install
   ```
   > Use `npm install` if you prefer npm. Keep the lockfile you already use in version control.

## 2. Configure environment variables

1. Copy the example below into a new `.env.local` file at the project root:
   ```
   JUPITER_API_KEY=
   ```
2. In the Jupiter portal, create an Ultra API key and copy the value.
3. Paste the key after `JUPITER_API_KEY=` (no quotes). This key stays server-side and is read by `app/_actions/jupiter.ts`.
4. Restart dev servers after editing `.env.local` so the new variable loads.

### Production/Vercel deployment

- Add the same `JUPITER_API_KEY` variable in the Vercel project settings under **Environment Variables**.
- Redeploy for the new secret to take effect.

## 3. Prepare the taker wallet

1. Choose the wallet that will sign swaps (the form label calls this the "taker").
2. Fund it with enough SOL to cover fees and the input token for `ExactIn` quotes.
3. If you are testing WBTC or other wrapped assets, ensure the wallet has the associated token accounts created.
4. Keep the keypair offline—only the public address is entered in the sandbox UI.

## 4. Launch the development server

1. Start Next.js with TurboPack:
   ```fish
   pnpm dev
   ```
2. Visit [http://localhost:3000/jupiter-ultra-test](http://localhost:3000/jupiter-ultra-test).
3. You should see the setup checklist followed by the Jupiter Ultra API Sandbox card.

## 5. Request a quote

1. Select input and output tokens from the dropdowns. Defaults are `wSOL → WBTC`.
2. Enter the human-readable amount (`0.1` means 0.1 wSOL) and your taker wallet address.
3. Choose `ExactIn` (fixed input) or `ExactOut` (fixed output). Optional: set slippage in basis points.
4. Click **Request quote**. The server action validates everything, sends the Ultra `/order` request, and streams the response back to the client.
5. On success you will see:
   - Request metadata badges (request ID, mode, slippage, expiry)
   - Raw in/out amounts (base units) and route breakdown
   - A base64 preview of the prepared transaction (first 120 characters)
6. On failure the card shows the error returned by Jupiter or the validation layer. Common causes:
   - Missing `JUPITER_API_KEY`
   - Unsupported token mint (update `lib/jupiter/tokens.ts`)
   - Amount precision higher than the token's decimal support

## 6. Execute the transaction (manual path)

The sandbox intentionally stops after generating the unsigned transaction. To execute it:

1. Copy the full base64 transaction from Jupiter's response (extend the playground to display it or log it server-side).
2. Decode and sign the transaction with the taker's keypair. Example using `@solana/web3.js`:

   ```ts
   import { Connection, VersionedTransaction } from "@solana/web3.js";

   const connection = new Connection(
     "https://api.mainnet-beta.solana.com",
     "confirmed"
   );
   const txBytes = Buffer.from(base64String, "base64");
   const transaction = VersionedTransaction.deserialize(txBytes);
   transaction.sign([takerSigner]);
   const signature = await connection.sendTransaction(transaction, {
     skipPreflight: false,
   });
   await connection.confirmTransaction(signature, "confirmed");
   ```

3. Alternatively, call Jupiter's `/execute` endpoint with the signed payload. Build this flow once you are comfortable with the manual signing process.
4. Monitor the signature on [Solscan](https://solscan.io) or your preferred explorer.

## 7. Extending the sandbox

- Surface the complete base64 transaction to the UI (currently truncated for readability).
- Add a server action that calls `/execute` after signing (requires storing the taker key securely or delegating to a custodial signer).
- Persist quote history and execution results if you need audit trails.
- Integrate error alerting (Sentry, Slack webhook) for failed quote/execute pairs.

## Troubleshooting

- **"Unsupported token mint"**: Append the mint, symbol, and decimals to `JUPITER_TOKENS` in `lib/jupiter/tokens.ts`.
- **400/429 errors from Jupiter**: Verify your API key has Ultra access and that you respect rate limits.<br>Retry with exponential backoff if you plan to automate requests.
- **`Amount must be greater than zero`**: Ensure the form input is a positive decimal and does not contain commas or whitespace.
- **Nothing renders on the test page**: Confirm the dev server restarted after creating `.env.local` and that you are on `/jupiter-ultra-test`.

## Reference

- Server action: `app/_actions/jupiter.ts`
- Playground component: `components/jupiter/jupiter-test-playground.tsx`
- Token registry: `lib/jupiter/tokens.ts`
- Jupiter Ultra docs: <https://station.jup.ag/docs/ultra>
