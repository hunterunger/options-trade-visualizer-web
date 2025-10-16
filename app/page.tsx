import { analyzeOptionTrade } from "@/app/_actions/option-analysis";
import { OptionWorkbench } from "@/components/options/option-workbench";

const defaultFormData = () => {
  const formData = new FormData();
  formData.append("symbol", "AAPL");
  const now = new Date();
  const defaultExpiration = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  while (defaultExpiration.getDay() !== 5) {
    defaultExpiration.setDate(defaultExpiration.getDate() + 1);
  }
  formData.append("expiration", defaultExpiration.toISOString().slice(0, 10));
  formData.append("optionType", "call");
  formData.append("position", "long");
  formData.append("strike", "190");
  formData.append("quantity", "1");
  formData.append("interestRate", "0.045");
  formData.append("dividendYield", "0.005");
  return formData;
};

export default async function Home() {
  const initialResultPromise = analyzeOptionTrade(defaultFormData());

  return (
    <main className="relative flex min-h-screen flex-col gap-16 bg-gradient-to-b from-background via-background/80 to-background px-6 pb-16 pt-12 sm:px-12 lg:px-16">
      <section className="relative overflow-hidden rounded-3xl border border-border/40 bg-[radial-gradient(circle_at_top,_hsl(var(--highlight)/0.18)_0%,_transparent_55%)] p-8 shadow-glow-accent sm:p-12">
        <div className="max-w-3xl space-y-6">
          <p className="inline-flex items-center rounded-full border border-highlight/30 bg-highlight/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-highlight">
            Option Blueprint
          </p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
            Visualize, compare, and stress-test option trades with institutional tooling and real market data.
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            Blend quantitative rigor with intuitive infographics. Pull current market quotes from Yahoo Finance, model Greeks, and understand payoff dynamics before you risk capital.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Profitable setups start with data",
              detail: "High open interest + balanced delta for smoother hedging",
            },
            {
              label: "Volatility edge",
              detail: "Compare implied vs. realized moves to gauge edge",
            },
            {
              label: "Risk clarity",
              detail: "Payoff diagrams + Greeks reveal hidden convexity",
            },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border/40 bg-muted/10 p-4 backdrop-blur">
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-[1]">
        <OptionWorkbench initialResult={await initialResultPromise} />
      </section>
    </main>
  );
}
