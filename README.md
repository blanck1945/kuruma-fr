# FlotaFR (Vite + React + Tailwind)

Frontend para probar en tiempo real la consulta de multas por patente contra `flotaBE`.

## Requisitos

- Node.js 20+
- Backend `flotaBE` corriendo en `http://localhost:8080`

## Ejecutar en desarrollo

```bash
npm install
npm run dev -- --port 5160
```

Abrir: `http://localhost:5160`

## Build

```bash
npm run build
npm run preview -- --port 5160
```

## Datos de prueba

- API Key default: `external-secret-1`
- Patente ejemplo: `AAA000`
