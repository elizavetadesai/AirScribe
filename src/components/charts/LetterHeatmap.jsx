import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { LETTERS } from '../../config/letters'

export function LetterHeatmap({ data = [] }) {
  const filled = LETTERS.map(l => {
    const found = data.find(d => d.letter === l)
    return { letter: l, accuracy: found ? found.accuracy : 0, attempted: !!found }
  })

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={filled} margin={{ top: 4, right: 4, bottom: 4, left: -30 }}>
        <XAxis
          dataKey="letter"
          tick={{ fontSize: 12, fontWeight: 600, fill: '#7a6a56', fontFamily: 'Inter' }}
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
          formatter={(val, _, { payload }) =>
            payload.attempted ? [`${val}%`, 'Avg accuracy'] : ['Not attempted', '']
          }
        />
        <Bar dataKey="accuracy" radius={[3, 3, 0, 0]}>
          {filled.map((entry) => (
            <Cell
              key={entry.letter}
              fill={
                !entry.attempted
                  ? 'rgba(100,80,55,0.1)'
                  : entry.accuracy >= 80
                  ? '#1f4f36'
                  : entry.accuracy >= 60
                  ? '#5a8a6a'
                  : '#b8824e'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
