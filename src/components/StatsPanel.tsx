import type { SaveStats, StatFormat } from '../types';

interface Props {
  stats: SaveStats | null;
}

// Render a stat value according to its format, returning the main figure and an optional
// secondary unit/word for muted styling.
function formatValue(value: number, format: StatFormat | undefined): { main: string; unit?: string } {
  switch (format) {
    case 'duration': {
      // value is seconds; show the two largest meaningful units.
      const days = Math.floor(value / 86400);
      const hours = Math.floor((value % 86400) / 3600);
      const mins = Math.floor((value % 3600) / 60);
      if (days > 0) return { main: `${days}d ${hours}h`, unit: '' };
      if (hours > 0) return { main: `${hours}h ${mins}m`, unit: '' };
      return { main: `${mins}`, unit: 'min' };
    }
    case 'distance': {
      // value is meters.
      if (value >= 1000) return { main: (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }), unit: 'km' };
      return { main: value.toLocaleString(), unit: 'm' };
    }
    case 'area': {
      // value is square meters.
      if (value >= 1_000_000) return { main: (value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }), unit: 'km²' };
      return { main: value.toLocaleString(), unit: 'm²' };
    }
    default:
      return { main: value.toLocaleString(), unit: '' };
  }
}

export default function StatsPanel({ stats }: Props) {
  if (!stats || stats.groups.length === 0) {
    return (
      <div style={{ color: '#888', fontSize: 12, padding: '12px 0' }}>
        Load a save to see factory statistics.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
      {stats.groups.map((group) => (
        <div key={group.title}>
          <div
            style={{
              color: '#FA9549',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              marginBottom: 6,
            }}
          >
            {group.title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {group.items.map((item) => {
              const { main, unit } = formatValue(item.value, item.format);
              return (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: '#ccc',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </div>
                    {item.hint && (
                      <div style={{ color: '#666', fontSize: 10.5, marginTop: 1 }}>{item.hint}</div>
                    )}
                  </div>
                  <div style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{main}</span>
                    {unit && <span style={{ color: '#888', fontSize: 11, marginLeft: 3 }}>{unit}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
