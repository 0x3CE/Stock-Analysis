import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

/**
 * StyledAreaChart — Graphique en aire avec dégradé, thème terminal.
 * Les couleurs sont en dur : recharts les écrit dans des attributs SVG.
 */
const AXE = '#263445';
const TEXTE_AXE = '#C9D3DE';
const GRILLE = '#1F2B3A';
const POLICE_MONO = 'JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace';

export const StyledAreaChart = ({
  data, dataKey, stroke, gradientId,
  yTickFormatter, tooltipFormatter,
  yDomain, yTicks, xDataKey = 'year',
}) => (
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={stroke} stopOpacity={0.28} />
          <stop offset="95%" stopColor={stroke} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 4" stroke={GRILLE} />
      <XAxis
        dataKey={xDataKey}
        stroke={AXE}
        tickLine={false}
        tick={{ fontSize: 12, fill: TEXTE_AXE, fontFamily: POLICE_MONO }}
        minTickGap={24}
      />
      <YAxis
        stroke={AXE}
        tickLine={false}
        tick={{ fontSize: 12, fill: TEXTE_AXE, fontFamily: POLICE_MONO }}
        tickFormatter={yTickFormatter}
        domain={yDomain || ['auto', 'auto']}
        ticks={yTicks}
        width={56}
      />
      <Tooltip
        contentStyle={{
          background: '#121C29', border: '1px solid #263445',
          borderRadius: '6px', fontFamily: POLICE_MONO, fontSize: '13px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        }}
        labelStyle={{ color: '#93A1B2', fontSize: '12px' }}
        itemStyle={{ color: '#E8EEF5' }}
        cursor={{ stroke: '#3A4B60', strokeDasharray: '3 3' }}
        formatter={tooltipFormatter}
      />
      <Area
        type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2.2}
        fill={`url(#${gradientId})`}
        dot={{ r: 3, fill: stroke, strokeWidth: 0 }}
        activeDot={{ r: 5, fill: stroke, stroke: '#0A1019', strokeWidth: 2 }}
      />
    </AreaChart>
  </ResponsiveContainer>
);
