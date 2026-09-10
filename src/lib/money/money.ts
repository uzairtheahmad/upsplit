import type { CurrencyCode, Money } from '@/types'

/**
 * Money is stored and computed as integer minor units. Floats never touch a
 * balance — they only appear when a human types one in, and are converted at
 * the boundary by `parseMoney`.
 */

interface CurrencyMeta {
  code: CurrencyCode
  symbol: string
  /** Number of minor units per major unit, as a power of ten. */
  decimals: number
  locale: string
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  PKR: { code: 'PKR', symbol: 'Rs', decimals: 2, locale: 'en-PK' },
  USD: { code: 'USD', symbol: '$', decimals: 2, locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', decimals: 2, locale: 'en-IE' },
  GBP: { code: 'GBP', symbol: '£', decimals: 2, locale: 'en-GB' },
  AED: { code: 'AED', symbol: 'AED', decimals: 2, locale: 'en-AE' },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[]

function factor(currency: CurrencyCode): number {
  return 10 ** CURRENCIES[currency].decimals
}

/**
 * Convert a user-entered major-unit string/number into minor units.
 * Returns null when the input is not a parseable amount.
 *
 * Parsing is done on the decimal *string* rather than by multiplying a float,
 * because `19.99 * 100` is 1998.9999999999998.
 */
export function parseMoney(input: string | number, currency: CurrencyCode = 'PKR'): Money | null {
  const decimals = CURRENCIES[currency].decimals
  const raw = String(input).trim().replace(/[\s,_]/g, '')
  if (raw === '' || raw === '-' || raw === '.') return null
  if (!/^-?\d*\.?\d*$/.test(raw)) return null

  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [whole = '0', fraction = ''] = unsigned.split('.')

  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals)
  const rounded =
    fraction.length > decimals && Number(fraction[decimals]) >= 5 ? 1 : 0

  const value = Number(whole) * 10 ** decimals + Number(paddedFraction || '0') + rounded
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

/** Minor units → a plain major-unit string suitable for an input field. */
export function toMajorString(amount: Money, currency: CurrencyCode = 'PKR'): string {
  const decimals = CURRENCIES[currency].decimals
  const negative = amount < 0
  const abs = Math.abs(Math.trunc(amount))
  const whole = Math.floor(abs / 10 ** decimals)
  const fraction = String(abs % 10 ** decimals).padStart(decimals, '0')
  const body = decimals > 0 ? `${whole}.${fraction}` : String(whole)
  return negative ? `-${body}` : body
}

/** Minor units as a JS number of major units — only for charting libraries. */
export function toMajorNumber(amount: Money, currency: CurrencyCode = 'PKR'): number {
  return amount / factor(currency)
}

interface FormatOptions {
  /** Drop the `.00` tail when the amount is a whole major unit. Default true. */
  compactDecimals?: boolean
  /** Always render a leading + or -. Default false. */
  signed?: boolean
  /** Render the absolute value. Default false. */
  absolute?: boolean
}

/**
 * The single place money becomes a string for humans. Presentation only —
 * never feed the result back into a calculation.
 */
export function formatMoney(
  amount: Money,
  currency: CurrencyCode = 'PKR',
  options: FormatOptions = {},
): string {
  const { compactDecimals = true, signed = false, absolute = false } = options
  const meta = CURRENCIES[currency]
  const value = absolute ? Math.abs(amount) : amount
  const negative = value < 0

  const minor = Math.abs(Math.trunc(value))
  const whole = Math.floor(minor / factor(currency))
  const fraction = minor % factor(currency)

  const showDecimals = !compactDecimals || fraction !== 0
  const wholeText = whole.toLocaleString(meta.locale)
  const body = showDecimals
    ? `${wholeText}.${String(fraction).padStart(meta.decimals, '0')}`
    : wholeText

  const sign = negative ? '-' : signed && value > 0 ? '+' : ''
  return `${sign}${meta.symbol} ${body}`
}

/** Short form for chart axes and dense cards: `Rs 48.2k`. */
export function formatMoneyCompact(amount: Money, currency: CurrencyCode = 'PKR'): string {
  const meta = CURRENCIES[currency]
  const major = Math.abs(amount) / factor(currency)
  const sign = amount < 0 ? '-' : ''

  if (major >= 1_000_000) return `${sign}${meta.symbol} ${(major / 1_000_000).toFixed(1)}m`
  if (major >= 1_000) return `${sign}${meta.symbol} ${(major / 1_000).toFixed(major >= 10_000 ? 0 : 1)}k`
  return formatMoney(amount, currency)
}

export function currencySymbol(currency: CurrencyCode): string {
  return CURRENCIES[currency].symbol
}

/**
 * Split `total` across `weights` so that the parts sum *exactly* to the total.
 *
 * Uses the largest-remainder method: every part gets its floor, then the
 * leftover minor units go one-by-one to the parts with the biggest discarded
 * remainder. Ties break on index, so the result is deterministic — the same
 * inputs always produce the same allocation, which matters because these
 * numbers are shown to people who will re-check them.
 *
 * Guarantees `sum(result) === total` for any non-negative weights whose sum
 * is greater than zero.
 */
export function allocate(total: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) return []

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (totalWeight <= 0) {
    // No usable weights: fall back to an even split so we never divide by zero.
    return allocate(total, weights.map(() => 1))
  }

  const sign = total < 0 ? -1 : 1
  const magnitude = Math.abs(total)

  const exact = weights.map((weight) => (magnitude * weight) / totalWeight)
  const floors = exact.map(Math.floor)
  const distributed = floors.reduce((sum, part) => sum + part, 0)
  let remainder = magnitude - distributed

  const order = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)

  const result = [...floors]
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) {
    result[order[i % order.length].index] += 1
  }

  return result.map((part) => part * sign)
}

/** Even split of `total` into `count` parts that still sums exactly. */
export function allocateEvenly(total: Money, count: number): Money[] {
  return allocate(total, new Array(Math.max(0, count)).fill(1))
}
