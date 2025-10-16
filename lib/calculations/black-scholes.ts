import type {
    OptionAnalysisInput,
    OptionAnalytics,
    OptionGreeks,
    OptionMoneyness,
    OptionType,
    ProfitPoint,
} from "@/types/options";

const CONTRACT_SIZE = 100;
const MONEINESS_TOLERANCE = 0.005;

const EPSILON = 1e-8;

const normPdf = (x: number) => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);

const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.sqrt(2)));

const erf = (x: number) => {
    // Abramowitz and Stegun formula 7.1.26
    const sign = x >= 0 ? 1 : -1;
    const absX = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * absX);
    const coefficients = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
    const poly = coefficients.reduce((acc, c, index) => acc + c * Math.pow(t, index + 1), 0);
    return sign * (1 - poly * Math.exp(-absX * absX));
};

interface BlackScholesPayload {
    price: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    probabilityITM: number;
    expectedMove: number;
}

const toYearFraction = (expirationISO: string) => {
    const expiration = new Date(expirationISO);
    const now = new Date();
    const millis = Math.max(expiration.getTime() - now.getTime(), EPSILON);
    return millis / (365 * 24 * 60 * 60 * 1000);
};

const ensurePositive = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);

export const calculateBlackScholes = (
    S: number,
    K: number,
    T: number,
    r: number,
    q: number,
    sigma: number,
    optionType: OptionType,
): BlackScholesPayload => {
    const safeSigma = ensurePositive(sigma, 0.0001);
    const safeT = ensurePositive(T, EPSILON);
    const sqrtT = Math.sqrt(safeT);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * safeSigma * safeSigma) * safeT) / (safeSigma * sqrtT);
    const d2 = d1 - safeSigma * sqrtT;

    const discountedSpot = S * Math.exp(-q * safeT);
    const discountedStrike = K * Math.exp(-r * safeT);

    const isCall = optionType === "call";

    const price = isCall
        ? discountedSpot * normCdf(d1) - discountedStrike * normCdf(d2)
        : discountedStrike * normCdf(-d2) - discountedSpot * normCdf(-d1);

    const delta = isCall ? Math.exp(-q * safeT) * normCdf(d1) : Math.exp(-q * safeT) * (normCdf(d1) - 1);
    const gamma = (Math.exp(-q * safeT) * normPdf(d1)) / (S * safeSigma * sqrtT);
    const theta = isCall
        ? (-Math.exp(-q * safeT) * S * normPdf(d1) * safeSigma) / (2 * sqrtT)
        - r * discountedStrike * normCdf(d2)
        + q * discountedSpot * normCdf(d1)
        : (-Math.exp(-q * safeT) * S * normPdf(d1) * safeSigma) / (2 * sqrtT)
        + r * discountedStrike * normCdf(-d2)
        - q * discountedSpot * normCdf(-d1);
    const vega = discountedSpot * normPdf(d1) * sqrtT;
    const rho = isCall
        ? safeT * discountedStrike * normCdf(d2)
        : -safeT * discountedStrike * normCdf(-d2);

    const probabilityITM = isCall ? normCdf(d2) : normCdf(-d2);
    const expectedMove = S * safeSigma * Math.sqrt(safeT);

    return {
        price,
        delta,
        gamma,
        theta,
        vega,
        rho,
        probabilityITM,
        expectedMove,
    };
};

export const buildOptionAnalytics = (
    input: OptionAnalysisInput,
    resolvedPrice: number,
    impliedVol: number,
    premium: number,
): OptionAnalytics => {
    const {
        strike,
        optionType,
        position,
        dividendYield,
        interestRate,
        quantity,
        expiration,
    } = input;

    const positionMultiplier = position === "long" ? 1 : -1;

    const timeToExpiry = toYearFraction(expiration);
    const bs = calculateBlackScholes(
        resolvedPrice,
        strike,
        timeToExpiry,
        interestRate,
        dividendYield,
        impliedVol,
        optionType,
    );

    const contractMultiplier = quantity * CONTRACT_SIZE;
    const effectiveQuantity = contractMultiplier * positionMultiplier;

    const payoffAtExpiration = generateProfitCurve({
        currentPrice: resolvedPrice,
        strike,
        premium,
        optionType,
        quantity: effectiveQuantity,
    });

    const breakEven = optionType === "call" ? strike + premium : strike - premium;
    const maxProfit = (() => {
        if (optionType === "call") {
            return position === "long" ? null : premium * contractMultiplier;
        }

        const profitPerShare = Math.max(strike - premium, 0);
        const profitPerContract = profitPerShare * CONTRACT_SIZE;
        return position === "long"
            ? profitPerContract * quantity
            : premium * contractMultiplier;
    })();

    const maxLoss = (() => {
        if (optionType === "call") {
            return position === "long" ? premium * contractMultiplier : null;
        }

        const lossPerShare = Math.max(strike - premium, 0);
        const lossPerContract = lossPerShare * CONTRACT_SIZE;
        return position === "long"
            ? premium * contractMultiplier
            : lossPerContract * quantity;
    })();

    const intrinsicPerShare = optionType === "call"
        ? Math.max(resolvedPrice - strike, 0)
        : Math.max(strike - resolvedPrice, 0);
    const premiumPerContract = premium * CONTRACT_SIZE;
    const intrinsicValuePerContractLong = intrinsicPerShare * CONTRACT_SIZE;
    const timeValuePerContractLong = Math.max(premiumPerContract - intrinsicValuePerContractLong, 0);
    const intrinsicValuePerContract = intrinsicValuePerContractLong * positionMultiplier;
    const intrinsicValueTotal = intrinsicValuePerContract * quantity;
    const timeValuePerContract = timeValuePerContractLong * positionMultiplier;
    const timeValueTotal = timeValuePerContract * quantity;
    const positionPremium = premiumPerContract * quantity * positionMultiplier;

    const priceDelta = Math.abs(resolvedPrice - strike);
    const toleranceBand = Math.max(resolvedPrice, strike) * MONEINESS_TOLERANCE;
    let moneyness: OptionMoneyness;
    if (priceDelta <= toleranceBand) {
        moneyness = "ATM";
    } else if (optionType === "call" ? resolvedPrice > strike : resolvedPrice < strike) {
        moneyness = "ITM";
    } else {
        moneyness = "OTM";
    }

    const annualizedReturn = typeof maxLoss === "number" && maxLoss > 0
        ? ((payoffAtPrice(payoffAtExpiration, resolvedPrice + bs.expectedMove) ?? 0) / maxLoss) /
        Math.max(timeToExpiry, EPSILON)
        : null;

    const greeks: OptionGreeks = {
        delta: bs.delta,
        gamma: bs.gamma,
        theta: bs.theta / 365,
        vega: bs.vega / 100,
        rho: bs.rho / 100,
    };

    return {
        underlyingPrice: resolvedPrice,
        position,
        breakEven,
        maxProfit,
        maxLoss,
        probabilityInTheMoney: bs.probabilityITM,
        expectedMove: bs.expectedMove,
        annualizedReturn,
        payoffAtExpiration,
        greeks,
        moneyness,
        premiumPerContract,
        positionPremium,
        intrinsicValuePerContract,
        intrinsicValueTotal,
        timeValuePerContract,
        timeValueTotal,
        contracts: quantity,
        contractSize: CONTRACT_SIZE,
    };
};

interface ProfitCurveConfig {
    currentPrice: number;
    strike: number;
    premium: number;
    optionType: OptionType;
    quantity: number;
    priceSteps?: number;
    rangeMultiplier?: number;
}

const payoffAtPrice = (curve: ProfitPoint[], price: number) => {
    const closest = curve.reduce((prev, point) =>
        Math.abs(point.price - price) < Math.abs(prev.price - price) ? point : prev,
    );
    return closest?.profit;
};

export const generateProfitCurve = ({
    currentPrice,
    strike,
    premium,
    optionType,
    quantity,
    priceSteps = 60,
    rangeMultiplier = 2,
}: ProfitCurveConfig): ProfitPoint[] => {
    const minPrice = Math.max(currentPrice / rangeMultiplier, 0);
    const maxPrice = currentPrice * rangeMultiplier;
    const step = (maxPrice - minPrice) / priceSteps;

    const points: ProfitPoint[] = [];

    for (let i = 0; i <= priceSteps; i += 1) {
        const price = minPrice + step * i;
        const intrinsic = optionType === "call"
            ? Math.max(price - strike, 0)
            : Math.max(strike - price, 0);
        const payoff = intrinsic - premium;
        points.push({ price, profit: payoff * quantity });
    }

    return points;
};
