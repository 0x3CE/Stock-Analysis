import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

/**
 * StyledAreaChart — Graphique Area avec dégradé, thème clair Aurum Wealth.
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
          <stop offset="5%"  stopColor={stroke} stopOpacity={0.15} />
          <stop offset="95%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#E8E2D4" />
      <XAxis
        dataKey={xDataKey}
        stroke="#D8D2C4"
        tick={{ fontSize: 11, fill: '#999999', fontFamily: 'DM Mono, monospace' }}
      />
      <YAxis
        stroke="#D8D2C4"
        tick={{ fontSize: 11, fill: '#999999', fontFamily: 'DM Mono, monospace' }}
        tickFormatter={yTickFormatter}
        domain={yDomain || ['auto', 'auto']}
      />
      <Tooltip
        contentStyle={{
          background: '#FFFFFF', border: '1px solid #E8E2D4',
          borderRadius: '10px', fontFamily: 'DM Sans, sans-serif',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}
        labelStyle={{ color: '#777777', fontSize: '12px' }}
        formatter={tooltipFormatter}
      />
      <Area
        type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2}
        fill={`url(#${gradientId})`}
        dot={{ r: 3, fill: stroke, strokeWidth: 0 }}
        activeDot={{ r: 5, fill: stroke, stroke: '#FFFFFF', strokeWidth: 2 }}
      />
    </AreaChart>
  </ResponsiveContainer>
);
