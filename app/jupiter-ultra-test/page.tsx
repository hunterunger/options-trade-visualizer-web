import JupiterTestPlayground from "@/components/jupiter/jupiter-test-playground";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const JupiterUltraTestPage = async () => {
    return (
        <main className="relative flex min-h-screen flex-col gap-8 bg-gradient-to-b from-background via-background/80 to-background px-6 pb-20 pt-12 sm:px-12 lg:px-16">
            <section className="relative overflow-hidden rounded-3xl border border-border/40 bg-[radial-gradient(circle_at_top,_hsl(var(--highlight)/0.18)_0%,_transparent_55%)] p-8 shadow-glow-accent sm:p-12">
                <div className="space-y-4">
                    <p className="inline-flex items-center rounded-full border border-highlight/30 bg-highlight/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-highlight">
                        Jupiter Ultra
                    </p>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">Ultra Swap API Playground</h1>
                        <p className="text-sm text-muted-foreground">
                            Use this sandbox to request quotes from Jupiter&rsquo;s Ultra API using your backend key. The
                            server action stores API calls on the backend, so your key never touches the browser.
                        </p>
                    </div>
                    <Card className="bg-muted/20">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Setup checklist</CardTitle>
                            <CardDescription className="text-sm text-muted-foreground">
                                Complete these steps before running a live swap.
                            </CardDescription>
                        </CardHeader>
                        <Separator className="bg-border/60" />
                        <CardContent className="space-y-2 pt-4 text-sm text-muted-foreground">
                            <p>1. Sign up at the Jupiter portal and generate an Ultra API key.</p>
                            <p>2. Add <code>JUPITER_API_KEY</code> to your environment (e.g. <code>.env.local</code>).</p>
                            <p>3. Provide a funded Solana wallet address as the taker for quotes.</p>
                            <p>4. Verify quoted routes and base64 transactions before passing them to <code>/execute</code>.</p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <JupiterTestPlayground />
        </main>
    );
};

export default JupiterUltraTestPage;
