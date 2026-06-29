import type { EfficiencyResult } from '../types';
import { humanize } from '../lib/buildings';
import { fmtRate, headlineUtil, STATUS_COLOR, STATUS_LABEL, utilColor } from '../lib/efficiencyDisplay';

interface Props {
  result: EfficiencyResult;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: '#222', borderRadius: 3, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(Math.min(1, value) * 100)}%`, height: '100%', background: color }} />
    </div>
  );
}

function Chips({
  label,
  items,
  onSelect,
}: {
  label: string;
  items: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            title="Show this building"
            style={{
              background: 'rgba(250,149,73,0.1)',
              border: '1px solid #444',
              borderRadius: 4,
              color: '#cdd',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 6px',
              textAlign: 'left',
            }}
          >
            {n.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function EfficiencyPanel({ result, onSelect, onClose }: Props) {
  const headline = headlineUtil(result);
  const pct = Math.round(headline * 100);
  const measured = result.measuredProductivity;

  return (
    <div
      style={{
        border: '1px solid #444',
        borderLeft: `3px solid ${STATUS_COLOR[result.status]}`,
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 10,
        background: 'rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ flex: 1, fontWeight: 700, color: '#fff' }}>{humanize(result.cls)}</div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: STATUS_COLOR[result.status],
          }}
        >
          {STATUS_LABEL[result.status]}
        </span>
        <button
          onClick={onClose}
          title="Close"
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
        >
          ✕
        </button>
      </div>

      {(result.recipeName || result.item) && (
        <div style={{ color: '#bbb', fontSize: 12, marginTop: -4 }}>
          {result.recipeName ?? result.item}
          {result.clock !== 1 && (
            <span style={{ color: '#888' }}> · {Math.round(result.clock * 100)}% clock</span>
          )}
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: '#888' }}>Utilization</span>
          <span style={{ color: '#fff', fontWeight: 700 }}>{pct}%</span>
        </div>
        <Bar value={headline} color={utilColor(headline)} />
      </div>

      {result.maxPerMin > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: '#888' }}>{result.item ?? 'Output'}</span>
          <span style={{ color: '#ddd' }}>
            {fmtRate(result.actualPerMin)} <span style={{ color: '#666' }}>/ {fmtRate(result.maxPerMin)} per min</span>
          </span>
        </div>
      )}

      {result.wastedPerMin > 0.5 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: '#888' }}>Wasted</span>
          <span style={{ color: '#f25c54' }}>{fmtRate(result.wastedPerMin)} / min unused</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: '#888' }} title="The game's own measured uptime over the last minute of play">
          Measured uptime
        </span>
        <span style={{ color: measured == null ? '#666' : '#ddd' }}>
          {measured == null ? '—' : `${Math.round(measured * 100)}%`}
        </span>
      </div>

      <Chips label="Supplied by" items={result.neighborsIn} onSelect={onSelect} />
      <Chips label="Feeds into" items={result.neighborsOut} onSelect={onSelect} />
    </div>
  );
}
