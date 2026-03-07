import { useMemo, useState } from "react";
import { InfoCard } from "../../components/ui/InfoCard";
import { StatusBanner } from "../../components/ui/StatusBanner";

function openCabaActa(sourceRef) {
  if (!sourceRef) {
    return;
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "https://buenosaires.gob.ar/licenciasdeconducir/consulta-de-infracciones/actaImagen.php";
  form.target = "_blank";
  form.style.display = "none";

  const actaInput = document.createElement("input");
  actaInput.type = "hidden";
  actaInput.name = "nroActa";
  actaInput.value = sourceRef;
  form.appendChild(actaInput);

  const imageInput = document.createElement("input");
  imageInput.type = "hidden";
  imageInput.name = "imagenes_acta";
  imageInput.value = "1";
  form.appendChild(imageInput);

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "-";
  }
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function statusBadgeClass(status) {
  const value = (status || "").toUpperCase();
  if (value.includes("CONTROLLER_REQUIRED")) {
    return "border-rose-700/40 bg-rose-500/10 text-rose-300";
  }
  if (value.includes("PAGO")) {
    return "border-emerald-700/40 bg-emerald-500/10 text-emerald-300";
  }
  if (value.includes("PEND")) {
    return "border-amber-700/40 bg-amber-500/10 text-amber-300";
  }
  return "border-slate-700 bg-slate-800/70 text-slate-300";
}

function humanStatus(status) {
  const value = (status || "").toUpperCase();
  if (value.includes("CONTROLLER_REQUIRED")) {
    return "Requiere controlador";
  }
  if (value.includes("PAGO")) {
    return "Pago voluntario";
  }
  if (value.includes("PEND")) {
    return "Pendiente";
  }
  return "Sin estado";
}

function FineItem({ fine, index }) {
  const amount = Number(fine.amount || 0).toLocaleString("es-AR");
  const issuedAt = formatDate(fine.issued_at);

  const canOpenActa = Boolean(fine.source_ref && fine.has_photo);
  const handleOpenActa = () => {
    if (canOpenActa) {
      openCabaActa(fine.source_ref);
    }
  };

  return (
    <InfoCard title={`Multa #${String(index + 1).padStart(2, "0")} - ${fine.offense || "Infracción sin descripción"}`}>
      <div
        className={`rounded-xl border border-slate-800/90 bg-slate-900/40 p-3 transition duration-200 hover:-translate-y-0.5 hover:border-sky-500/40 hover:bg-slate-900/70 ${
          canOpenActa ? "cursor-pointer" : ""
        }`}
        onClick={handleOpenActa}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleOpenActa();
          }
        }}
        role={canOpenActa ? "button" : undefined}
        tabIndex={canOpenActa ? 0 : undefined}
        aria-label={canOpenActa ? `Abrir acta ${fine.source_ref} en sitio oficial` : undefined}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Importe</p>
            <p className="text-lg font-semibold text-sky-300">
              {fine.currency} {amount}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadgeClass(
                fine.status,
              )}`}
            >
              {humanStatus(fine.status)}
            </span>
            {fine.has_photo ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-700/40 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
                <span aria-hidden="true">📷</span>
                Con foto
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-2 py-1 text-xs font-medium text-slate-300">
                <span aria-hidden="true">🚫</span>
                Sin foto
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          <p>
            <span className="text-slate-400">Fecha:</span> {issuedAt}
          </p>
          <p>
            <span className="text-slate-400">Jurisdicción:</span> {fine.jurisdiction || "-"}
          </p>
          <p>
            <span className="text-slate-400">Acta:</span> {fine.source_ref || "No visible en API externa"}
          </p>
          <p>
            <span className="text-slate-400">Controlador:</span>{" "}
            {fine.controller ? fine.controller : fine.status === "CONTROLLER_REQUIRED" ? "Requiere controlador" : "-"}
          </p>
          <p>
            <span className="text-slate-400">Fuente:</span> {fine.source || "-"}
          </p>
        </div>
        {canOpenActa ? (
          <p className="mt-3 text-xs text-sky-300">Click para abrir el detalle de acta en CABA.</p>
        ) : fine.source_ref ? (
          <p className="mt-3 text-xs text-slate-400">Esta multa no tiene foto disponible para abrir.</p>
        ) : null}
      </div>
    </InfoCard>
  );
}

export function FineResultList({ fines, isLoading, error, hasSearched }) {
  const [sortOrder, setSortOrder] = useState("newest");
  const [statusFilter, setStatusFilter] = useState("all");

  const sortedFines = useMemo(() => {
    const filtered = fines.filter((fine) => {
      const status = (fine?.status || "").toUpperCase();
      if (statusFilter === "voluntary") {
        return status.includes("PAGO");
      }
      if (statusFilter === "controller") {
        return status.includes("CONTROLLER_REQUIRED");
      }
      return true;
    });
    const copy = [...filtered];
    copy.sort((a, b) => {
      const aTime = a?.issued_at ? new Date(a.issued_at).getTime() : 0;
      const bTime = b?.issued_at ? new Date(b.issued_at).getTime() : 0;
      if (sortOrder === "oldest") {
        return aTime - bTime;
      }
      return bTime - aTime;
    });
    return copy;
  }, [fines, sortOrder, statusFilter]);

  if (!hasSearched) {
    return (
      <StatusBanner variant="success">
        Completá patente o DNI y presioná Buscar ahora.
      </StatusBanner>
    );
  }
  if (error) {
    return <StatusBanner variant="error">{error}</StatusBanner>;
  }
  if (!isLoading && fines.length === 0) {
    return <StatusBanner variant="warning">Sin multas para la patente consultada.</StatusBanner>;
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <label htmlFor="fine-status-filter" className="text-sm text-slate-300">
          Estado
        </label>
        <select
          id="fine-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
        >
          <option value="all">Todos</option>
          <option value="voluntary">Pago voluntario</option>
          <option value="controller">Requiere controlador</option>
        </select>
        <label htmlFor="fine-sort-order" className="text-sm text-slate-300">
          Ordenar por fecha
        </label>
        <select
          id="fine-sort-order"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
        >
          <option value="newest">Más nueva a más vieja</option>
          <option value="oldest">Más vieja a más nueva</option>
        </select>
      </div>
      {sortedFines.length === 0 && (
        <StatusBanner variant="warning">No hay multas para el filtro seleccionado.</StatusBanner>
      )}
      <div className="space-y-3">
        {sortedFines.map((fine, index) => (
          <FineItem
            key={fine.source_ref || `${fine.offense}-${fine.amount}-${fine.issued_at}-${index}`}
            fine={fine}
            index={index}
          />
        ))}
      </div>
    </>
  );
}

