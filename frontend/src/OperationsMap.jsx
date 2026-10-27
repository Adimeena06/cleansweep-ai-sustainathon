
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [28.4744, 77.504];

function makeIcon(color, symbol) {
  return L.divIcon({
    className: "cs-map-marker-wrapper",
    html: `
      <div style="
        width:36px;
        height:36px;
        border-radius:50%;
        background:${color};
        border:3px solid white;
        box-shadow:0 2px 9px #0004;
        display:flex;
        align-items:center;
        justify-content:center;
        color:white;
        font-size:17px;
        font-weight:bold;
      ">${symbol}</div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
}

const truckIcon = makeIcon("#1769d2", "T");
const reportIcon = makeIcon("#d94343", "!");
const assignedIcon = makeIcon("#16864a", "✓");

function ValidBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    }
  }, [map, points]);

  return null;
}

function validCoordinates(latitude, longitude) {
  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Number(latitude) >= -90 &&
    Number(latitude) <= 90 &&
    Number(longitude) >= -180 &&
    Number(longitude) <= 180 &&
    !(Number(latitude) === -90 && Number(longitude) === -180)
  );
}

export default function OperationsMap({
  reports = [],
  trucks = [],
  onRecommend
}) {
  const mappedReports = reports.filter(report =>
    validCoordinates(report.latitude, report.longitude)
  );

  const mappedTrucks = trucks.filter(truck =>
    validCoordinates(truck.latitude, truck.longitude)
  );

  const points = [
    ...mappedReports.map(report => [
      Number(report.latitude),
      Number(report.longitude)
    ]),
    ...mappedTrucks.map(truck => [
      Number(truck.latitude),
      Number(truck.longitude)
    ])
  ];

  return (
    <section className="cs-card cs-operations-map">
      <div className="cs-section-head inside">
        <div>
          <span className="cs-kicker">GEOSPATIAL OPERATIONS</span>
          <h2>Waste & fleet live map</h2>
        </div>

        <span className="cs-map-count">
          {mappedReports.length} mapped reports · {mappedTrucks.length} trucks
        </span>
      </div>

      <div className="cs-map-legend">
        <span><i className="report-dot" /> Waste report</span>
        <span><i className="truck-dot" /> Collection truck</span>
        <span><i className="assigned-dot" /> Assigned report</span>
      </div>

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={13}
        scrollWheelZoom
        style={{
          height: "430px",
          width: "100%",
          borderRadius: "13px",
          zIndex: 1
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ValidBounds points={points} />

        {mappedReports.map(report => {
          const isAssigned = Boolean(report.truck);

          return (
            <Marker
              key={`report-${report.id}`}
              position={[
                Number(report.latitude),
                Number(report.longitude)
              ]}
              icon={isAssigned ? assignedIcon : reportIcon}
            >
              <Popup>
                <div style={{ minWidth: 190 }}>
                  <strong>Report #{report.id}</strong>
                  <p>{report.category} waste</p>
                  <p>Severity: {report.severity}</p>
                  <p>Status: {report.status}</p>
                  <p>Location: {report.location}</p>
                  <p>
                    Truck: {report.truck || "Not assigned"}
                  </p>

                  {onRecommend &&
                    !report.truck &&
                    report.backendId && (
                      <button
                        type="button"
                        onClick={() => onRecommend(report)}
                        style={{
                          padding: "8px 11px",
                          border: 0,
                          borderRadius: 7,
                          background: "#188b4b",
                          color: "white",
                          cursor: "pointer"
                        }}
                      >
                        Recommend truck
                      </button>
                    )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {mappedTrucks.map(truck => (
          <Marker
            key={`truck-${truck.id}`}
            position={[
              Number(truck.latitude),
              Number(truck.longitude)
            ]}
            icon={truck.status === "available" ? truckIcon : assignedIcon}
          >
            <Popup>
              <strong>{truck.id}</strong>
              <p>{truck.name || truck.area || "Collection truck"}</p>
              <p>Status: {truck.status}</p>
              {truck.remaining_capacity != null && (
                <p>Remaining capacity: {truck.remaining_capacity}</p>
              )}
              {truck.supported_waste_types && (
                <p>
                  Waste types:{" "}
                  {truck.supported_waste_types.join(", ")}
                </p>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="cs-map-summary">
        <div>
          <strong>{mappedReports.length}</strong>
          <span>Reports on map</span>
        </div>
        <div>
          <strong>{mappedTrucks.length}</strong>
          <span>Trucks on map</span>
        </div>
        <div>
          <strong>
            {reports.filter(report =>
              !validCoordinates(report.latitude, report.longitude)
            ).length}
          </strong>
          <span>Reports without valid coordinates</span>
        </div>
      </div>

      {reports.some(report =>
        !validCoordinates(report.latitude, report.longitude)
      ) && (
        <p className="cs-help">
          Some reports cannot be mapped because their coordinates are
          missing or invalid. Add a real location to display them.
        </p>
      )}
    </section>
  );
}

