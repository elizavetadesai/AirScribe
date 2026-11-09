import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

export function TrendLine({ data = [] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="label-caps text-center">No sessions yet — complete some practice to see your trend.</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -24 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(100,80,55,0.1)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9e8e78', fontFamily: 'Inter' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#9e8e78', fontFamily: 'Inter' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            color: 'var(--color-text)',
            fontSize: 12,
            fontFamily: 'Inter',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9e8e78', fontFamily: 'Inter' }} />
        <Line
          type="monotone"
          dataKey="accuracy"
          name="Shape accuracy"
          stroke="#1f4f36"
          strokeWidth={2}
          dot={{ r: 2.5, fill: '#1f4f36' }}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="smoothness"
          name="Smoothness"
          stroke="#b8824e"
          strokeWidth={2}
          dot={{ r: 2.5, fill: '#b8824e' }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
