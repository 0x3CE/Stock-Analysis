const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const percentStatus = (value, goodFrom = 20, warnFrom = 10) => {
  if (value == null) return { tone: 'neutral', label: 'N/A' };
  if (value >= goodFrom) return { tone: 'good', label: 'Excellent' };
  if (value >= warnFrom) return { tone: 'neutral', label: 'Sain' };
  return { tone: 'warn', label: 'À surveiller' };
};

const inverseStatus = (value, goodMax = 50, warnMax = 150) => {
  if (value == null) return { tone: 'neutral', label: 'N/A' };
  if (value <= goodMax) return { tone: 'good', label: 'Sain' };
  if (value <= warnMax) return { tone: 'neutral', label: 'Modéré' };
  return { tone: 'warn', label: 'À surveiller' };
};

const ratioStatus = (value, goodFrom = 1.5, warnFrom = 1) => {
  if (value == null) return { tone: 'neutral', label: 'N/A' };
  if (value >= goodFrom) return { tone: 'good', label: 'Sain' };
  if (value >= warnFrom) return { tone: 'neutral', label: 'Correct' };
  return { tone: 'warn', label: 'Fragile' };
};

const betaStatus = (value) => {
  if (value == null) return { tone: 'neutral', label: 'N/A' };
  if (value <= 1.1) return { tone: 'good', label: 'Stable' };
  if (value <= 1.5) return { tone: 'neutral', label: 'Volatil' };
  return { tone: 'warn', label: 'Très volatil' };
};

const epsStatus = (value) => {
  if (value == null) return { tone: 'neutral', label: 'N/A' };
  if (value > 0) return { tone: 'good', label: 'Positif' };
  return { tone: 'warn', label: 'Négatif' };
};

const formatCurrency = (value) => (value == null ? '—' : `$${value.toFixed(2)}`);
const formatPercent = (value) => (value == null ? '—' : `${value.toFixed(1)}%`);
const formatNumber = (value, digits = 2) => (value == null ? '—' : value.toFixed(digits));

const buildRange52wRow = (kpis) => {
  const current = toNumber(kpis.current_price);
  const low = toNumber(kpis.low_52w);
  const high = toNumber(kpis.high_52w);

  const hasRange = low != null && high != null && high > low;
  const percentile = hasRange && current != null ? clamp((current - low) / (high - low)) : null;

  return {
    key: 'range_52w',
    label: 'Range 52 semaines',
    value: hasRange ? `${formatCurrency(low)} – ${formatCurrency(high)}` : '—',
    position: percentile,
    status: percentile == null
      ? { tone: 'neutral', label: 'N/A' }
      : percentile >= 0.7
        ? { tone: 'good', label: 'Haut de range' }
        : percentile >= 0.3
          ? { tone: 'neutral', label: 'Milieu de range' }
          : { tone: 'warn', label: 'Bas de range' },
  };
};

export const DEFAULT_METRIC_RULES = {
  beta: {
    label: 'Beta',
    getValue: (kpis) => toNumber(kpis.beta),
    formatValue: (value) => formatNumber(value, 2),
    getStatus: betaStatus,
    getPosition: (value) => (value == null ? null : clamp(value / 2)),
  },
  roe: {
    label: 'ROE',
    getValue: (kpis) => toNumber(kpis.roe),
    formatValue: formatPercent,
    getStatus: (value) => percentStatus(value, 20, 10),
    getPosition: (value) => (value == null ? null : clamp(value / 35)),
  },
  debt_to_equity: {
    label: 'Debt / Equity',
    getValue: (kpis) => toNumber(kpis.debt_to_equity),
    formatValue: (value) => formatNumber(value, 1),
    getStatus: (value) => inverseStatus(value, 50, 150),
    getPosition: (value) => (value == null ? null : clamp(value / 250)),
  },
  current_ratio: {
    label: 'Current Ratio',
    getValue: (kpis) => toNumber(kpis.current_ratio),
    formatValue: (value) => formatNumber(value, 2),
    getStatus: (value) => ratioStatus(value, 1.5, 1),
    getPosition: (value) => (value == null ? null : clamp(value / 3)),
  },
  eps: {
    label: 'EPS',
    getValue: (kpis) => toNumber(kpis.eps),
    formatValue: formatCurrency,
    getStatus: epsStatus,
    getPosition: (value) => (value == null ? null : clamp((value + 10) / 20)),
  },
  profit_margin: {
    label: 'Profit Margin',
    getValue: (kpis) => toNumber(kpis.profit_margin),
    formatValue: formatPercent,
    getStatus: (value) => percentStatus(value, 20, 10),
    getPosition: (value) => (value == null ? null : clamp(value / 30)),
  },
};

export const buildPerformanceLedgerRows = (kpis, metricRules = DEFAULT_METRIC_RULES) => {
  const rows = [buildRange52wRow(kpis)];

  Object.values(metricRules).forEach((rule) => {
    const value = rule.getValue(kpis);
    rows.push({
      key: rule.label.toLowerCase().replace(/\s+/g, '_'),
      label: rule.label,
      value: rule.formatValue(value),
      position: rule.getPosition ? rule.getPosition(value, kpis) : null,
      status: rule.getStatus(value, kpis),
    });
  });

  return rows;
};
