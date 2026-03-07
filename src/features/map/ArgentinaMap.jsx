import { useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { COVERAGE, PROVINCE_DETAIL, getFillColor } from './coverageData';
import ProvinceDetailPanel from './ProvinceDetailPanel';

// CABA is tiny on the map — supplement the shape with a marker
const CABA_COORDS = [-58.3816, -34.6037];

// TopoJSON object key inside argentina-provinces.json
const GEO_URL = '/argentina-provinces.json';

export default function ArgentinaMap({ activeSource, onSelectSource }) {
  const [selectedProvince, setSelectedProvince] = useState(null);

  function handleProvinceClick(name) {
    setSelectedProvince(prev => prev === name ? null : name);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Map */}
      <div className="flex-1">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-65, -38], scale: 700 }}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = geo.properties.NAME_1;
                const coverage = COVERAGE[name];
                const isActive = !!coverage && activeSource === coverage.source;
                const isSelected = name === selectedProvince;
                const hasCoverage = !!coverage;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => handleProvinceClick(name)}
                    style={{
                      default: {
                        fill: getFillColor(coverage, isActive),
                        stroke: isSelected ? '#38bdf8' : '#0f172a',
                        strokeWidth: isSelected ? 1.5 : 0.5,
                        outline: 'none',
                      },
                      hover: {
                        fill: hasCoverage
                          ? coverage.type === 'city' ? '#fbbf24' : '#38bdf8'
                          : '#263347',
                        stroke: '#0f172a',
                        strokeWidth: 0.5,
                        outline: 'none',
                        cursor: 'pointer',
                      },
                      pressed: { outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* CABA — small shape on full map; add a marker for visibility */}
          <Marker coordinates={CABA_COORDS}>
            <circle
              r={6}
              fill={
                selectedProvince === 'Ciudad de Buenos Aires'
                  ? '#38bdf8'
                  : activeSource === 'caba'
                  ? '#b45309'
                  : '#d97706'
              }
              stroke="#0f172a"
              strokeWidth={1}
              style={{ cursor: 'pointer' }}
              onClick={() => handleProvinceClick('Ciudad de Buenos Aires')}
            />
            <text
              textAnchor="middle"
              y={-10}
              style={{ fontSize: 8, fill: '#f1f5f9', pointerEvents: 'none', fontWeight: 600 }}
            >
              CABA
            </text>
          </Marker>
        </ComposableMap>
      </div>

      {/* Side panel: province detail or legend */}
      <div className="lg:w-64">
        {selectedProvince ? (
          <ProvinceDetailPanel
            provinceName={selectedProvince}
            detail={PROVINCE_DETAIL[selectedProvince]}
            activeSource={activeSource}
            onSelectSource={onSelectSource}
            onClose={() => setSelectedProvince(null)}
          />
        ) : (
          <div className="flex flex-col gap-3 lg:w-52">
            <p className="text-xs uppercase tracking-wider text-slate-400">Referencias</p>
            <LegendItem
              color="#0284c7"
              label="Cobertura provincial"
              description="Toda la provincia"
            />
            <LegendItem
              color="#d97706"
              label="Cobertura municipal"
              description="Ciudad específica"
            />
            <LegendItem
              color="#1e293b"
              label="Sin cobertura"
              description="No disponible aún"
            />
            <p className="mt-2 text-xs text-slate-500">
              Hacé click en cualquier provincia para ver la cobertura disponible.
            </p>
            {activeSource !== 'all' && (
              <button
                className="mt-1 text-left text-xs text-sky-400 underline"
                onClick={() => onSelectSource('all')}
              >
                Ver todas
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label, description }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-0.5 h-3 w-3 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <div>
        <p className="text-xs font-medium text-slate-200">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}
