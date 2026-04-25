interface DebugOverlayProps {
  responseMs: number | null;
  model: string;
  mainApi?: string;
  source: string;
  streamEnabled: boolean;
}

export function DebugOverlay({ responseMs, model, mainApi, source, streamEnabled }: DebugOverlayProps) {
  return (
    <aside className="debug-overlay" aria-label="Debug info">
      <div>
        <span>Main API</span>
        <strong>{mainApi || 'unknown'}</strong>
      </div>
      <div>
        <span>Model</span>
        <strong>{model || 'unknown'}</strong>
      </div>
      <div>
        <span>Source</span>
        <strong>{source || 'unknown'}</strong>
      </div>
      <div>
        <span>Response</span>
        <strong>{responseMs !== null ? `${responseMs} ms` : 'n/a'}</strong>
      </div>
      <div>
        <span>Streaming</span>
        <strong>{streamEnabled ? 'on' : 'off'}</strong>
      </div>
    </aside>
  );
}
