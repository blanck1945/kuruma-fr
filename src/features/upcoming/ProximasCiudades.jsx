const UPCOMING = [
  {
    name: 'Berisso',
    province: 'Buenos Aires',
    status: 'pba',
    statusLabel: 'Cubierto por PBA',
    description: 'Usa el sistema provincial de Buenos Aires. Podés consultarlo seleccionando PBA.',
  },
  {
    name: 'Ezeiza',
    province: 'Buenos Aires',
    status: 'pba',
    statusLabel: 'Cubierto por PBA',
    description: 'Usa el sistema provincial de Buenos Aires. Podés consultarlo seleccionando PBA.',
  },
  {
    name: 'San Vicente',
    province: 'Buenos Aires',
    status: 'pba',
    statusLabel: 'Cubierto por PBA',
    description: 'Usa el sistema provincial de Buenos Aires. Podés consultarlo seleccionando PBA.',
  },
  {
    name: 'Cañuelas',
    province: 'Buenos Aires',
    status: 'pba',
    statusLabel: 'Cubierto por PBA',
    description: 'Usa el sistema provincial de Buenos Aires. Podés consultarlo seleccionando PBA.',
  },
  {
    name: 'Hurlingham',
    province: 'Buenos Aires',
    status: 'pba',
    statusLabel: 'Cubierto por PBA',
    description: 'Usa el sistema provincial de Buenos Aires. Podés consultarlo seleccionando PBA.',
  },
  {
    name: 'Lanús',
    province: 'Buenos Aires',
    status: 'login',
    statusLabel: 'Requiere credenciales',
    description: 'El sistema municipal exige una cuenta registrada. No es automatizable sin credenciales de acceso.',
  },
  {
    name: 'Tres de Febrero',
    province: 'Buenos Aires',
    status: 'login',
    statusLabel: 'Requiere credenciales',
    description: 'El sistema municipal exige una cuenta registrada. No es automatizable sin credenciales de acceso.',
  },
];

const STATUS_STYLES = {
  pba:   { badge: 'bg-sky-900/50 text-sky-300 border border-sky-700', dot: 'bg-sky-400' },
  login: { badge: 'bg-amber-900/40 text-amber-300 border border-amber-700', dot: 'bg-amber-400' },
};

export default function ProximasCiudades({ onSelectSource }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-100">Próximas ciudades</h2>
        <p className="mt-1 text-sm text-slate-400">
          Jurisdicciones aún no integradas directamente, con el estado actual de cada una.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {UPCOMING.map((city) => {
          const style = STATUS_STYLES[city.status];
          return (
            <div
              key={city.name}
              className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-100">{city.name}</p>
                  <p className="text-xs text-slate-500">{city.province}</p>
                </div>
                <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  {city.statusLabel}
                </span>
              </div>

              <p className="text-xs leading-relaxed text-slate-400">{city.description}</p>

              {city.status === 'pba' && (
                <button
                  className="mt-auto self-start rounded-lg border border-sky-700 bg-sky-900/30 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-900/60"
                  onClick={() => onSelectSource('pba')}
                >
                  Consultar con PBA
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
