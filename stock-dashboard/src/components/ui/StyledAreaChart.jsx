import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

/**
 * StyledAreaChart — Graphique Area avec dégradé, thème clair Aurum Wealth.
 */
export const StyledAreaChart = ({
  data, dataKey, stroke, gradientId,
  yTickFormatter, tooltipFormatter,
  yDomain, yTicks, xDataKey = 'year',
}) => (
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={stroke} stopOpacity={0.15} />
          <stop offset="95%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#E4DECE" />
      <XAxis
        dataKey={xDataKey}
        stroke="#D7D0BF"
        tick={{ fontSize: 11, fill: '#8C8779', fontFamily: 'IBM Plex Mono, monospace' }}
      />
      <YAxis
        stroke="#D7D0BF"
        tick={{ fontSize: 11, fill: '#8C8779', fontFamily: 'IBM Plex Mono, monospace' }}
        tickFormatter={yTickFormatter}
        domain={yDomain || ['auto', 'auto']}
        ticks={yTicks}
      />
      <Tooltip
        contentStyle={{
          background: '#FFFFFF', border: '1px solid #E8E2D4',
          borderRadius: '10px', fontFamily: 'Inter, sans-serif',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}
        labelStyle={{ color: '#8C8779', fontSize: '12px' }}
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
