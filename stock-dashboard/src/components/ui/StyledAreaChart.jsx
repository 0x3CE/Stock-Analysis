import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

/**
 * StyledAreaChart — Graphique Area avec dégradé et style cohérent avec le design.
 * Utilisé dans OverviewTab et FinancialsTab.
 */
export const StyledAreaChart = ({
  data, dataKey, stroke, gradientId,
  yTickFormatter, tooltipFormatter,
  yDomain, xDataKey = 'year',
}) => (
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={stroke} stopOpacity={0.2} />
          <stop offset="95%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
      <XAxis
        dataKey={xDataKey}
        stroke="#334155"
        tick={{ fontSize: 11, fill: '#475569', fontFamily: 'DM Mono, monospace' }}
      />
      <YAxis
        stroke="#334155"
        tick={{ fontSize: 11, fill: '#475569', fontFamily: 'DM Mono, monospace' }}
        tickFormatter={yTickFormatter}
        domain={yDomain || ['auto', 'auto']}
      />
      <Tooltip
        contentStyle={{
          background: '#0d1117', border: '1px solid #21262d',
          borderRadius: '10px', fontFamily: 'DM Sans, sans-serif',
        }}
        labelStyle={{ color: '#8b949e', fontSize: '12px' }}
        formatter={tooltipFormatter}
      />
      <Area
        type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2}
        fill={`url(#${gradientId})`}
        dot={{ r: 3, fill: stroke, strokeWidth: 0 }}
        activeDot={{ r: 5, fill: stroke, stroke: '#0d1117', strokeWidth: 2 }}
      />
    </AreaChart>
  </ResponsiveContainer>
);