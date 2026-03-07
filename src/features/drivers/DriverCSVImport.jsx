import AIExcelImport from "../../components/AIExcelImport";
import PropTypes from "prop-types";

const COLUMNS = [
  { key: "name",               label: "Nombre" },
  { key: "dni",                label: "DNI" },
  { key: "license_number",     label: "Licencia" },
  { key: "license_expires_at", label: "Vencimiento" },
  { key: "phone",              label: "Teléfono" },
  { key: "email",              label: "Email" },
];

export default function DriverCSVImport({ backendUrl, apiKey, onImport }) {
  return (
    <AIExcelImport
      backendUrl={backendUrl}
      apiKey={apiKey}
      endpoint="/v1/external/parse-drivers-csv"
      columns={COLUMNS}
      validate={(r) => Boolean(r?.name?.trim())}
      onImport={onImport}
      mockFile="/mocks/conductores.xlsx"
    />
  );
}

DriverCSVImport.propTypes = {
  backendUrl: PropTypes.string.isRequired,
  apiKey: PropTypes.string.isRequired,
  onImport: PropTypes.func.isRequired,
};
