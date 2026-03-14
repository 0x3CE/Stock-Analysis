/**
 * Exporte une analyse boursière complète au format CSV.
 */
export function exportToCSV(analysis) {
  const { ticker, name, kpis, historical_data, dividend_history, profit_margin_history, piotroski_score } = analysis;

  const lines = [];

  // En-tête
  lines.push(`Analyse boursière — ${name} (${ticker})`);
  lines.push(`Exporté le,${new Date().toLocaleDateString('fr-FR')}`);
  lines.push('');

  // KPIs
  lines.push('=== KPIs ===');
  lines.push('Indicateur,Valeur');
  const kpiLabels = {
    current_price:  'Prix actuel',
    price_change:   'Variation (%)',
    market_cap:     'Market Cap (Mds$)',
    pe_ratio:       'P/E Ratio',
    dividend_yield: 'Dividend Yield (%)',
    volume:         'Volume (M)',
    high_52w:       '52W High',
    low_52w:        '52W Low',
    beta:           'Beta',
    eps:            'EPS',
    roe:            'ROE (%)',
    debt_to_equity: 'Debt/Equity',
    current_ratio:  'Current Ratio',
    profit_margin:  'Marge nette (%)',
  };
  Object.entries(kpiLabels).forEach(([key, label]) => {
    lines.push(`${label},${kpis[key] ?? 'N/A'}`);
  });
  lines.push('');

  // Score Piotroski
  lines.push('=== Piotroski F-Score ===');
  lines.push(`Score total,${piotroski_score?.total_score ?? 'N/A'}/9`);
  lines.push(`Interprétation,${piotroski_score?.interpretation ?? 'N/A'}`);
  lines.push('');
  lines.push('Critère,Score');
  [...(piotroski_score?.profitability || []),
   ...(piotroski_score?.leverage || []),
   ...(piotroski_score?.operating || [])].forEach((c) => {
    lines.push(`"${c.criterion}",${c.score}`);
  });
  lines.push('');

  // Historique des prix
  lines.push('=== Historique des Prix ===');
  lines.push('Date,Prix ($),Volume');
  (historical_data || []).forEach((r) => {
    lines.push(`${r.date},${r.price},${r.volume}`);
  });
  lines.push('');

  // Dividendes
  lines.push('=== Dividendes ===');
  lines.push('Année,Montant ($),Date');
  (dividend_history || []).forEach((r) => {
    lines.push(`${r.year},${r.amount},${r.date || ''}`);
  });
  lines.push('');

  // Bénéfice net et marges
  lines.push('=== Bénéfice Net et Marges ===');
  lines.push('Année,Bénéfice Net (Mds$),Marge nette (%)');
  (profit_margin_history || []).forEach((r) => {
    lines.push(`${r.year},${r.net_income},${r.margin}`);
  });

  const csv = lines.join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ticker}_analyse.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
