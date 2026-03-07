export default function ProvinceDetailPanel({ provinceName, detail, activeSource, onSelectSource, onClose }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{provinceName}</h3>
        <button
          onClick={onClose}
          className="shrink-0 text-slate-400 transition-colors hover:text-slate-200"
          aria-label="Cerrar panel"
        >
          ×
        </button>
      </div>

      {detail ? (
        <div className="flex flex-col gap-4">
          {detail.sections.map((section) => (
            <div key={section.label}>
              <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">{section.label}</p>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const isActive = item.source === activeSource;
                  return (
                    <button
                      key={item.source}
                      onClick={() => {
                        onSelectSource(item.source);
                        onClose();
                      }}
                      className={[
                        'flex items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors',
                        isActive
                          ? 'bg-sky-700 text-white'
                          : 'bg-slate-700 text-slate-200 hover:bg-slate-600',
                      ].join(' ')}
                    >
                      <span className="text-sky-400">▶</span>
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-400">
          <p>Sin cobertura disponible aún.</p>
          <p className="mt-1">Esta jurisdicción no está integrada.</p>
        </div>
      )}
    </div>
  );
}
