/**
 * ERP Phase 4: forecasting. Pure math over monthly aggregates — no db.
 *
 * Deliberately simple and honest (PRD §21): a weighted moving average with a
 * linear trend nudge, never presented as fact — the UI labels everything as
 * অনুমান / Forecast. Returns null when there isn't enough history, so the UI
 * can show the "insufficient data" state instead of a made-up number.
 */

export interface MonthlyActual {
  month: string
  value: number
}

export interface ForecastResult {
  nextMonth: string
  value: number
  /** Months of history actually used. */
  historyMonths: number
  /** Simple dispersion measure so the UI can caveat the number. */
  spreadPct: number
}

const MIN_HISTORY = 3
const MAX_HISTORY = 6

/**
 * Weighted moving average (recent months weigh more) adjusted by the average
 * month-over-month delta across the window.
 */
export function forecastNext(
  actuals: MonthlyActual[],
  addMonthsFn: (month: string, n: number) => string = (m) => m
): ForecastResult | null {
  // Only months with any recorded activity count as history.
  const series = actuals.filter((a) => a.value > 0).slice(-MAX_HISTORY)
  if (series.length < MIN_HISTORY) return null

  const n = series.length
  let weightedSum = 0
  let weightTotal = 0
  for (let i = 0; i < n; i++) {
    const weight = i + 1 // oldest = 1 … newest = n
    weightedSum += series[i].value * weight
    weightTotal += weight
  }
  const weightedAvg = weightedSum / weightTotal

  let deltaSum = 0
  for (let i = 1; i < n; i++) deltaSum += series[i].value - series[i - 1].value
  const avgDelta = deltaSum / (n - 1)

  // Dampen the trend by half — projections shouldn't over-extrapolate spikes.
  const value = Math.max(0, weightedAvg + avgDelta / 2)

  const mean = series.reduce((a, s) => a + s.value, 0) / n
  const spreadPct =
    mean === 0 ? 0 : Math.round((Math.abs(avgDelta) / mean) * 100)

  return {
    nextMonth: addMonthsFn(series[series.length - 1].month, 1),
    value: Math.round(value),
    historyMonths: n,
    spreadPct,
  }
}

/** True when the dataset can't support any forecast UI. */
export function hasSufficientHistory(actuals: MonthlyActual[]): boolean {
  return actuals.filter((a) => a.value > 0).length >= MIN_HISTORY
}
