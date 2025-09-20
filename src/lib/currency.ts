const ZERO_DECIMAL_CURRENCIES = new Set(["KRW", "JPY", "VND", "IDR", "CLP"]);

const FALLBACK_LOCALE_BY_CURRENCY: Record<string, string> = {
  KRW: "ko-KR",
  JPY: "ja-JP",
  VND: "vi-VN",
  IDR: "id-ID",
  CLP: "es-CL",
};

export function getCurrencyMetadata(currency: string) {
  const upper = currency.toUpperCase();
  const decimals = ZERO_DECIMAL_CURRENCIES.has(upper) ? 0 : 2;
  const locale = FALLBACK_LOCALE_BY_CURRENCY[upper] ?? "en-US";

  return { currency: upper, decimals, locale };
}

export function formatCurrency(
  amountMinor: number,
  currency: string,
  options?: { locale?: string },
) {
  const { currency: normalizedCurrency, decimals, locale } = getCurrencyMetadata(currency);
  const resolvedLocale = options?.locale ?? locale;
  const divisor = Math.pow(10, decimals);
  const amountMajor = decimals === 0 ? amountMinor : amountMinor / divisor;

  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amountMajor);
}

export function toMajorUnits(amountMinor: number, currency: string) {
  const { decimals } = getCurrencyMetadata(currency);
  return decimals === 0 ? amountMinor : amountMinor / Math.pow(10, decimals);
}
