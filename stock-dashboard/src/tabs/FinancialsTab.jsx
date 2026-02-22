import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { StyledAreaChart } from '../components/ui/StyledAreaChart';
import { sortByYear } from '../utils/Formatters';

const CARD_STYLE = {
  background: '#111827', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px',
};

/**
 * FinancialsTab — Historiques financiers : bénéfice net, marge nette, dividendes.
 */
const FinancialsTab = ({ profit_margin_history, dividend_history, chartHeight }) => {
  const profitSorted   = sortByYear(profit_margin_history);
  const dividendSorted = sortByYear(dividend_history);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Bénéfice net */}
      <div style={{ ...CARD_STYLE, animation: 'cardIn 0.4s ease 0.05s forwards', opacity: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '17px', color: '#f1f5f9' }}>
            Bénéfice Net
          </h2>
          <span style={{ fontSize: '11px', color: '#475569', fontFamily: 'DM Mono, monospace' }}>
            milliards USD
          </span>
        </div>
        <div style={{ height: chartHeight }}>
          <StyledAreaChart
            data={profitSorted} dataKey="net_income" stroke="#f97316"
            gradientId="netIncomeGrad"
            yTickFormatter={(v) => `$${v}B`}
            tooltipFormatter={(v) => [`$${v}B`, 'Bénéfice net']}
            yDomain={['dataMin - 2', 'dataMax + 2']}
          />
        </div>
      </div>

      {/* Marge nette avec ligne de référence à 20% */}
      <div style={{ ...CARD_STYLE, animation: 'cardIn 0.4s ease 0.1s forwards', opacity: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '17px', color: '#f1f5f9' }}>
            Marge Nette
          </h2>
          <span style={{ fontSize: '11px', color: '#475569', fontFamily: 'DM Mono, monospace' }}>%</span>
        </div>
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={profitSorted}>
              <defs>
                <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
              <XAxis dataKey="year" stroke="#334155"
                tick={{ fontSize: 11, fill: '#475569', fontFamily: 'DM Mono, monospace' }} />
              <YAxis stroke="#334155"
                tick={{ fontSize: 11, fill: '#475569', fontFamily: 'DM Mono, monospace' }}
                tickFormatter={(v) => `${v}%`} />
              <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.35}
                label={{ value: 'Seuil 20%', fill: '#22c55e', fontSize: 10, fontFamily: 'DM Mono, monospace' }} />
              <Tooltip
                contentStyle={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '10px', fontFamily: 'DM Sans, sans-serif' }}
                labelStyle={{ color: '#8b949e', fontSize: '12px' }}
                formatter={(v) => [`${v}%`, 'Marge nette']}
              />
              <Area type="monotone" dataKey="margin" stroke="#22c55e" strokeWidth={2}
                fill="url(#marginGrad)"
                dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#22c55e', stroke: '#0d1117', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dividendes */}
      {dividendSorted.length > 0 ? (
        <div style={{ ...CARD_STYLE, animation: 'cardIn 0.4s ease 0.15s forwards', opacity: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '17px', color: '#f1f5f9' }}>
              Dividendes
            </h2>
            <span style={{ fontSize: '11px', color: '#475569', fontFamily: 'DM Mono, monospace' }}>
              5 dernières années
            </span>
          </div>
          <div style={{ height: chartHeight }}>
            <StyledAreaChart
              data={dividendSorted} dataKey="amount" stroke="#10b981"
              gradientId="dividendGrad"
              yTickFormatter={(v) => `$${v.toFixed(2)}`}
              tooltipFormatter={(v) => [`$${v}`, 'Dividende']}
              yDomain={[(min) => Math.max(0, min - 0.05), (max) => max + 0.05]}
            />
          </div>
        </div>
      ) : (
        <div style={{ ...CARD_STYLE, textAlign: 'center', padding: '48px', animation: 'cardIn 0.4s ease 0.15s forwards', opacity: 0 }}>
          <p style={{ color: '#475569', fontSize: '14px', fontFamily: 'DM Sans, sans-serif' }}>
            Aucun dividende versé sur les 5 dernières années.
          </p>
        </div>
      )}
    </div>
  );
};

export default FinancialsTab;