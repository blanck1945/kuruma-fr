// Mapeo nombre-de-provincia (campo NAME_1 del TopoJSON) → cobertura
// TopoJSON source: FrissAnalytics/topojson (DIVA-GIS), object key: ARG_adm1
export const COVERAGE = {
  'Buenos Aires':           { source: 'pba',             type: 'province', label: 'Buenos Aires', drillable: true },
  'Ciudad de Buenos Aires': { source: 'caba',             type: 'city',     label: 'CABA' },
  'Córdoba':                { source: 'cordoba',          type: 'province', label: 'Córdoba' },
  'Entre Ríos':             { source: 'entrerios',        type: 'province', label: 'Entre Ríos' },
  'Santa Fe':               { source: 'santafe',          type: 'province', label: 'Santa Fe' },
  'Misiones':               { source: 'misiones',         type: 'province', label: 'Misiones' },
  'Corrientes':             { source: 'corrientes',       type: 'province', label: 'Corrientes' },
  'Chaco':                  { source: 'chaco',            type: 'province', label: 'Chaco' },
  'Salta':                  { source: 'salta',            type: 'city',     label: 'Ciudad de Salta' },
  'Jujuy':                  { source: 'jujuy',            type: 'city',     label: 'San Salvador de Jujuy' },
  // Nuevas provincias con cobertura municipal
  'La Pampa':               { source: 'santarosa',        type: 'city',     label: 'Santa Rosa' },
  'Neuquén':                { source: 'villaangostura',   type: 'city',     label: 'Villa La Angostura' },
  'Mendoza':                { source: 'mendoza',           type: 'province', label: 'Mendoza' },
};

export const PROVINCE_DETAIL = {
  'Buenos Aires': {
    sections: [
      {
        label: 'Interior de la provincia',
        items: [{ source: 'pba', name: 'Buenos Aires (PBA)' }]
      },
      {
        label: 'Conurbano GBA',
        items: [
          { source: 'lomasdezamora',   name: 'Lomas de Zamora' },
          { source: 'avellaneda',      name: 'Avellaneda' },
          { source: 'almirante_brown', name: 'Almirante Brown' },
          { source: 'escobar',         name: 'Escobar' },
          { source: 'tresdefebrero',   name: 'Tres de Febrero' },
          { source: 'lamatanza',       name: 'La Matanza' },
          { source: 'tigre',           name: 'Tigre' },
          { source: 'sanmartin',       name: 'San Martín' },
        ]
      }
    ]
  },
  'Ciudad de Buenos Aires': {
    sections: [{ label: 'Cobertura', items: [{ source: 'caba', name: 'CABA' }] }]
  },
  'Córdoba': {
    sections: [
      { label: 'Provincia',  items: [{ source: 'cordoba',       name: 'Córdoba' }] },
      { label: 'Ciudades',   items: [{ source: 'riotercero',    name: 'Río Tercero' }] }
    ]
  },
  'Entre Ríos': {
    sections: [{ label: 'Provincia', items: [{ source: 'entrerios', name: 'Entre Ríos' }] }]
  },
  'Santa Fe': {
    sections: [
      { label: 'Provincia', items: [{ source: 'santafe',      name: 'Santa Fe' }] },
      { label: 'Ciudades',  items: [{ source: 'venadotuerto', name: 'Venado Tuerto' }] }
    ]
  },
  'Misiones': {
    sections: [
      { label: 'Provincia', items: [{ source: 'misiones', name: 'Misiones' }] },
      { label: 'Ciudades',  items: [{ source: 'posadas',  name: 'Posadas' }] }
    ]
  },
  'Corrientes': {
    sections: [{ label: 'Provincia', items: [{ source: 'corrientes', name: 'Corrientes' }] }]
  },
  'Chaco': {
    sections: [
      { label: 'Provincia', items: [{ source: 'chaco',          name: 'Chaco' }] },
      { label: 'Ciudades',  items: [{ source: 'roquesaenzpena', name: 'Roque Sáenz Peña' }] }
    ]
  },
  'Salta':    { sections: [{ label: 'Ciudad', items: [{ source: 'salta',          name: 'Ciudad de Salta' }] }] },
  'Jujuy':    { sections: [{ label: 'Ciudad', items: [{ source: 'jujuy',          name: 'San Salvador de Jujuy' }] }] },
  'La Pampa': { sections: [{ label: 'Ciudad', items: [{ source: 'santarosa',      name: 'Santa Rosa' }] }] },
  'Neuquén':  { sections: [{ label: 'Ciudad',    items: [{ source: 'villaangostura', name: 'Villa La Angostura' }] }] },
  'Mendoza':  { sections: [{ label: 'Provincia', items: [{ source: 'mendoza',        name: 'Mendoza' }] }] },
};

export function getFillColor(coverage, isActive) {
  if (!coverage) return '#1e293b';                                                  // sin cobertura — slate-800
  if (isActive)  return coverage.type === 'city' ? '#b45309' : '#0369a1';          // activo — más saturado
  return coverage.type === 'city' ? '#d97706' : '#0284c7';                         // amber-600 / sky-600
}
