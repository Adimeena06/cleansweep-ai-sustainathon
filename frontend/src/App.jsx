import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowRight, BarChart3, CheckCircle2, Clock3,
  Cloud, CloudUpload, FileImage, Leaf, LoaderCircle, MapPin, Recycle,
  RefreshCw, ScanSearch, ShieldCheck, Sparkles, Truck, Upload, X,
  Camera, Coins, ClipboardList, Navigation, Check, CircleDot, Image as ImageIcon, CloudRain
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
const API = "";
const STORAGE_KEY = "cleansweep_demo_reports_v1";

const SEVERITY_POINTS = { Low: 10, Medium: 25, High: 50, Critical: 100 };
const STATUS_FLOW = ["Submitted", "Under Verification", "Verified", "Assigned", "In Progress", "Resolved"];

const seedReports = [
  {
    id: "CS-2026-1001", filename: "plastic-waste-demo.jpg", category: "Plastic",
    severity: "High", points: 50, location: "Knowledge Park, Greater Noida",
    date: "2026-10-25", time: "10:15", status: "In Progress",
    truck: "TRK-04", createdAt: new Date(Date.now() - 3600000).toISOString(),
    note: "Plastic waste near a public walkway", demo: true
  },
  {
    id: "CS-2026-1002", filename: "mixed-litter-demo.jpg", category: "Mixed waste",
    severity: "Medium", points: 25, location: "Sector Alpha, Greater Noida",
    date: "2026-10-25", time: "11:40", status: "Verified",
    truck: "", createdAt: new Date(Date.now() - 7200000).toISOString(),
    note: "Litter beside a roadside bin", demo: true
  },
  {
    id: "CS-2026-1003", filename: "dumping-site-demo.jpg", category: "Mixed waste",
    severity: "Critical", points: 100, location: "Surajpur Road, Greater Noida",
    date: "2026-10-24", time: "16:20", status: "Resolved",
    truck: "TRK-02", createdAt: new Date(Date.now() - 86400000).toISOString(),
    note: "Large dumping area; collection completed", demo: true
  }
];

const trucksSeed = [
  { id: "TRK-01", area: "Knowledge Park", status: "Available" },
  { id: "TRK-02", area: "Surajpur Road", status: "Returning" },
  { id: "TRK-03", area: "Sector Alpha", status: "Available" },
  { id: "TRK-04", area: "Knowledge Park", status: "Collecting" }
];

function readReports() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : seedReports;
  } catch {
    return seedReports;
  }
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`cs-badge ${tone}`}>{children}</span>;
}

function Stat({ icon: Icon, label, value, note, color = "green" }) {
  return <div className="cs-stat">
    <div className={`cs-stat-icon ${color}`}><Icon size={19} /></div>
    <div className="cs-stat-label">{label}</div>
    <div className="cs-stat-value">{value}</div>
    <div className="cs-muted cs-small">{note}</div>
  </div>;
}

export default function App() {
  const [portal, setPortal] = useState("citizen");
  const [page, setPage] = useState("home");
  const [reports, setReports] = useState(readReports);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [location, setLocation] = useState("");
  const [geoMessage, setGeoMessage] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [backendReportsLoaded, setBackendReportsLoaded] = useState(false); 
  const [severity, setSeverity] = useState("Medium");
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [incidentTime, setIncidentTime] = useState(new Date().toTimeString().slice(0, 5));
  const [note, setNote] = useState("");
  const [detection, setDetection] = useState(null);
  const [health, setHealth] = useState("checking");
  const [filter, setFilter] = useState("All");
  const [trucks, setTrucks] = useState([]);
  const [dispatchRecommendation, setDispatchRecommendation] = useState(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [rainMode, setRainMode] = useState(false);
  const [weatherInfo, setWeatherInfo] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  }, [reports]);

  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => { if (!r.ok) throw new Error("offline"); return r.json(); })
      .then(() => setHealth("online"))
      .catch(() => setHealth("offline"));
    
  }, []);

  useEffect(() => {
  let cancelled = false;

  async function loadReports() {
    try {
      const response = await fetch(`${API}/api/reports/`);

      if (!response.ok) {
        throw new Error("Failed to load reports");
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Invalid reports response");
      }

      if (!cancelled) {
        setReports(data.map(mapBackendReport));
        setBackendReportsLoaded(true);
      }
    } catch (err) {
      console.error("Could not load backend reports:", err);
    }
  }

  loadReports();

  return () => {
    cancelled = true;
  };
}, []);
  useEffect(() => {
    return () => { if (preview)
       URL.revokeObjectURL(preview); };
  }, [preview]);

  const citizenPoints = reports.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
  const resolvedCount = reports.filter(r => r.status === "Resolved").length;
  const activeCount = reports.filter(r => r.status !== "Resolved" && r.status !== "Rejected").length;
  const pendingCount = reports.filter(r => ["Submitted", "Under Verification"].includes(r.status)).length;

  async function loadDashboardData() {
  setRefreshing(true);

  try {
    const [reportsResponse, trucksResponse] = await Promise.all([
      fetch(`${API}/api/reports/`),
      fetch(`${API}/api/trucks/`)
    ]);

    if (!reportsResponse.ok || !trucksResponse.ok) {
      throw new Error("Could not refresh dashboard data.");
    }

    const [reportData, truckData] = await Promise.all([
      reportsResponse.json(),
      trucksResponse.json()
    ]);

    setReports(reportData.map(mapBackendReport));

    setTrucks(
      truckData.map((truck) => ({
        id: truck.truck_id,
        backendId: truck.id,
        name: truck.name,
        area: `Greater Noida · ${truck.latitude}, ${truck.longitude}`,
        latitude: truck.latitude,
        longitude: truck.longitude,
        capacity: truck.capacity,
        currentLoad: truck.current_load,
        remainingCapacity: truck.remaining_capacity,
        supportedWasteTypes: truck.supported_waste_types || [],
        delayMinutes: truck.delay_minutes || 0,
        status:
          truck.status === "available"
            ? "Available"
            : truck.status === "busy"
              ? "Busy"
              : truck.status
      }))
    );

    setBackendReportsLoaded(true);
    setHealth("online");
    setError("");
  } catch (err) {
    setError(err.message || "Dashboard refresh failed.");
  } finally {
    setRefreshing(false);
  }
}

async function recommendTruck(reportId) {
  if (!reportId) {
    setError("Select a complaint first.");
    return;
  }

  setDispatchLoading(true);
  setError("");
  setMessage("");
  setDispatchRecommendation(null);

  try {
    const response = await fetch(
      `${API}/api/dispatch/recommend/${reportId}`,
      { method: "POST" }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Truck recommendation failed."
      );
    }

    setDispatchRecommendation(data);
    setMessage("Dispatch recommendation generated.");
  } catch (err) {
    setError(err.message);
  } finally {
    setDispatchLoading(false);
  }
}

async function assignRecommendedTruck(reportId, truckId) {
  if (!reportId || !truckId) {
    setError("Choose a complaint and a recommended truck.");
    return;
  }

  setDispatchLoading(true);
  setError("");
  setMessage("");

  try {
    const response = await fetch(
      `${API}/api/dispatch/assign/${reportId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ truck_id: truckId })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Truck assignment failed."
      );
    }

    setMessage(`Complaint #${reportId} assigned to ${truckId}.`);
    setDispatchRecommendation(null);

    await loadDashboardData();
  } catch (err) {
    setError(err.message);
  } finally {
    setDispatchLoading(false);
  }
}

  function chooseFile(f) {
    if (!f) return;
    setError(""); setMessage(""); setDetection(null);
    if (!f.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (f.size > 10 * 1024 * 1024) { setError("Image must be 10 MB or smaller."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f));
  }

  function useMyLocation() {
  setGeoMessage("");

  if (!navigator.geolocation) {
    setGeoMessage("GPS isn't supported. Enter the location manually.");
    return;
  }

  setGeoMessage("Getting your location...");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latitude = pos.coords.latitude;
      const longitude = pos.coords.longitude;

      setCoordinates({ latitude, longitude });
      setLocation(
        `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
      );

      setGeoMessage(
        "GPS coordinates added. Confirm the location before submitting."
      );
    },
    () => {
      setGeoMessage(
        "GPS access failed. Allow location permission or enter the location manually."
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 10000
    }
  );
}

  async function analyseImage() {
  if (!file) {
    setError("Take or upload a photo first.");
    return;
  }

  if (!location.trim()) {
    setError("Enter the waste location before analysing.");
    return;
  }

  setBusy(true);
  setError("");
  setMessage("");
  setDetection(null);

  try {
    const body = new FormData();

    body.append("file", file);
    body.append("location", location.trim());

    if (coordinates) {
      body.append("latitude", String(coordinates.latitude));
      body.append("longitude", String(coordinates.longitude));
    }

    if (note.trim()) {
      body.append("description", note.trim());
    }

    const response = await fetch(
      `${API}/api/waste/detect?confidence=0.25`,
      {
        method: "POST",
        body
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "AI detection failed."
      );
    }

    setDetection(data);

    const counts = data.class_counts || {};

    const entries = Object.entries(counts)
      .filter(([, count]) => Number(count) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]));

    const labels = {
      plastic: "Plastic",
      paper_cardboard: "Paper & cardboard",
      metal: "Metal",
      glass: "Glass"
    };

    if (entries.length) {
      setMessage(
        `AI detected ${labels[entries[0][0]] || entries[0][0]} waste. Review the details before continuing.`
      );
    } else {
      setMessage(
        "AI analysis completed. Review the image and severity before continuing."
      );
    }
  } catch (err) {
    setError(
      `${err.message} Make sure the FastAPI backend is running.`
    );
  } finally {
    setBusy(false);
  }
}

  async function submitReport(e) {
  e.preventDefault();

  setError("");
  setMessage("");

  if (!file) {
    setError("Please take or upload a waste photo.");
    return;
  }

  if (!location.trim()) {
    setError("Add or confirm the waste location before submitting.");
    return;
  }

  if (!detection) {
    setError("Please analyse the image before submitting your report.");
    return;
  }

  if (!detection.report?.id) {
    setError(
      "The AI response does not contain a saved report ID. Check the backend response."
    );
    return;
  }

  setBusy(true);

  try {
    const response = await fetch(
      `${API}/api/reports/${detection.report.id}`
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail || "Could not retrieve your saved report."
      );
    }

    const labels = {
      plastic: "Plastic",
      paper_cardboard: "Paper & cardboard",
      metal: "Metal",
      glass: "Glass",
      paper_cardboard: "Paper & cardboard"
    };

    const rawType = data.waste_type || "Mixed waste";

    const created = data.created_at
      ? new Date(data.created_at)
      : new Date();

    const report = {
      id: String(data.id),
      backendId: Number(data.id),
      filename: file.name,
      category:
        labels[rawType.toLowerCase()] ||
        rawType.replaceAll("_", " "),
      severity:
        (data.severity || severity).charAt(0).toUpperCase() +
        (data.severity || severity).slice(1).toLowerCase(),
      points:
        Number(data.clean_points) ||
        SEVERITY_POINTS[severity] ||
        25,
      location: data.location || location.trim(),
      date: created.toLocaleDateString("en-CA"),
      time: created.toTimeString().slice(0, 5),
      status: data.status || "Submitted",
      truck: data.assigned_truck || "",
      note: data.description || note.trim(),
      createdAt: created.toISOString(),
      totalDetections:
        data.detection_count ||
        detection.total_detections ||
        detection.detections?.length ||
        0,
      imageUrl: data.image_url
        ? `${API}${data.image_url}`
        : "",
      annotatedImageUrl: data.annotated_image_url
        ? `${API}${data.annotated_image_url}`
        : "",
      demo: false
    };

    setReports((previous) => [
      report,
      ...previous.filter((item) => item.id !== report.id)
    ]);

    setMessage(
  `Report saved successfully! ${report.points} Clean Points recorded.`
);

    setFile(null);
    setPreview("");
    setDetection(null);
    setNote("");
    setCoordinates(null);
    setPage("my-reports");
  } catch (err) {
    setError(err.message || "Could not submit the report.");
  } finally {
    setBusy(false);
  }
}

  async function updateReport(id, updates) {
  const report = reports.find((r) => r.id === id);

  if (!report) return;

  if (report.backendId && updates.status) {
    try {
      const response = await fetch(
        `${API}/api/reports/${report.backendId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: updates.status,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Could not update report status");
      }

      const updated = await response.json();

      setReports((previous) =>
        previous.map((r) =>
          r.id === id
            ? {
                ...r,
                ...updates,
                status: updated.status ?? updates.status,
              }
            : r
        )
      );

      setError("");
      setMessage(`Report ${id} updated successfully.`);
      return;
    } catch (err) {
      setError(err.message);
      return;
    }
  }

  setReports((previous) =>
    previous.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    )
  );
}

  async function assignTruck(reportId, truckId) {
    const report = reports.find((item) => item.id === reportId || String(item.backendId) === String(reportId));
    const backendReportId = report?.backendId;

    if (!backendReportId) {
      setError("This complaint is not linked to a backend record, so it cannot be assigned yet.");
      return;
    }
    if (!truckId) {
      setError("Please select a truck.");
      return;
    }

    setError("");
    setMessage("");
    setDispatchLoading(true);
    try {
      const response = await fetch(`${API}/api/dispatch/assign/${backendReportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ truck_id: truckId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "The backend could not assign this truck.");
      }

      setMessage(`Complaint #${backendReportId} assigned to ${truckId}.`);
      await loadDashboardData();
    } catch (err) {
      setError(err.message || "Truck assignment failed.");
      // Refresh the table from the backend so the UI doesn't show a false assignment.
      try { await loadDashboardData(); } catch (_) {}
    } finally {
      setDispatchLoading(false);
    }
  }

  async function activateRainMode() {
    setWeatherLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API}/api/weather/demo`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Could not start the weather simulation.");
      }
      setWeatherInfo(data);
      setRainMode(true);
      setMessage("Simulated heavy-rain mode activated. No truck has been dispatched.");
    } catch (err) {
      setError(`${err.message || "Weather simulation failed."} Make sure the FastAPI backend is running.`);
    } finally {
      setWeatherLoading(false);
    }
  }

  function deactivateRainMode() {
    setRainMode(false);
    setWeatherInfo(null);
    setMessage("Rain simulation stopped. Normal dashboard appearance restored.");
    setError("");
  }

  function switchPortal(next) {
    setPortal(next);
    setPage(next === "citizen" ? "home" : "admin");
    setError(""); setMessage("");
  }

  const visibleReports = reports.filter(r => filter === "All" || r.status === filter);

  return <>
    <style>{styles}</style>
    <div className={`cs-app ${rainMode ? "cs-rain-mode" : ""}`}>
      {rainMode && <div className="cs-rain-overlay" aria-hidden="true" />}
      <header className="cs-header">
        <button className="cs-brand" onClick={() => switchPortal("citizen")} aria-label="CleanSweep AI home">
          <span className="cs-logo"><Recycle size={24} /></span>
          <span><strong>CleanSweep<span className="cs-brand-ai">AI</span></strong><small>SMARTER CITIES. CLEANER TOMORROWS.</small></span>
        </button>
        <div className="cs-header-right">
          <span className={`cs-api ${health}`}><i />{health === "online" ? "AI backend online" : health === "offline" ? "AI backend offline" : "Checking backend"}</span>
          <button className={`cs-portal-tab ${portal === "citizen" ? "selected" : ""}`} onClick={() => switchPortal("citizen")}><Leaf size={16} /> Citizen Portal</button>
          <button className={`cs-portal-tab ${portal === "admin" ? "selected" : ""}`} onClick={() => switchPortal("admin")}><ShieldCheck size={16} /> Admin Dashboard</button>
        </div>
      </header>

      {rainMode && <section className="cs-weather-emergency-banner" role="status">
        <CloudRain size={25} />
        <div className="cs-weather-banner-copy">
          <strong>WEATHER EMERGENCY · SIMULATION MODE</strong>
          <span>Heavy rainfall simulated: {weatherInfo?.rain_mm ?? 38} mm · Greater Noida · Review drain-blockage and flooding complaints.</span>
          <small>Demo scenario only — no real weather emergency or truck dispatch has been triggered.</small>
        </div>
        <button className="cs-weather-stop" onClick={deactivateRainMode}>Deactivate rain mode</button>
      </section>}

      {portal === "citizen" ? <>
        <nav className="cs-subnav">
          <button className={page === "home" || page === "report" ? "active" : ""} onClick={() => setPage("home")}>Home</button>
          <button className={page === "my-reports" ? "active" : ""} onClick={() => setPage("my-reports")}>My Reports <span>{reports.length}</span></button>
          <button className={page === "wallet" ? "active" : ""} onClick={() => setPage("wallet")}>Clean Points Wallet</button>
          <span className="cs-demo-tag">HACKATHON DEMO</span>
        </nav>

        {page === "home" && <main className="cs-main">
          <section className="cs-citizen-hero">
            <div className="cs-hero-copy">
              <Badge tone="green"><Sparkles size={13} /> CITIZEN-POWERED CLEANLINESS</Badge>
              <h1>See waste.<br /><em>Report it. Resolve it.</em></h1>
              <p>Help make your neighbourhood cleaner. Report waste in a few simple steps, track collection progress, and earn Clean Points.</p>
              <button className="cs-btn primary large" onClick={() => { setPage("report"); setError(""); setMessage(""); }}><Camera size={18} /> Report Waste <ArrowRight size={17} /></button>
              <div className="cs-hero-proof"><span><CheckCircle2 size={15} /> AI-assisted reporting</span><span><MapPin size={15} /> Location confirmation</span><span><Coins size={15} /> Clean Points</span></div>
            </div>
            <div className="cs-hero-visual">
              <div className="cs-visual-ring ring1" /><div className="cs-visual-ring ring2" />
              <div className="cs-visual-center"><Recycle size={84} strokeWidth={1.3} /><span>MAKE EVERY<br />REPORT COUNT</span></div>
              <div className="cs-float-card float-top"><span className="cs-float-icon"><CheckCircle2 size={18} /></span><div><strong>Community action</strong><small>One report at a time</small></div></div>
              <div className="cs-float-card float-bottom"><Coins size={22} /><div><strong>{citizenPoints} Clean Points</strong><small>Your demo wallet balance</small></div></div>
            </div>
          </section>

          <section className="cs-stats-grid">
            <Stat icon={ClipboardList} label="My reports" value={reports.length} note="Reports in this demo" />
            <Stat icon={Clock3} label="Awaiting action" value={activeCount} note="Not yet resolved" color="amber" />
            <Stat icon={CheckCircle2} label="Resolved" value={resolvedCount} note="Marked completed" color="blue" />
            <Stat icon={Coins} label="Clean Points" value={citizenPoints} note="Demo points earned" color="purple" />
          </section>

          <section className="cs-section-head"><div><span className="cs-kicker">HOW IT WORKS</span><h2>Small action. Real accountability.</h2></div></section>
          <div className="cs-steps">
            {[
              [Camera, "01", "Capture", "Take a picture or upload a photo of the waste."],
              [ScanSearch, "02", "Analyse", "AI helps identify waste materials from the image."],
              [MapPin, "03", "Confirm", "Review the location, date, time and severity."],
              [Truck, "04", "Track", "Follow the complaint as collection progresses."]
            ].map(([Icon, n, title, desc]) => <article className="cs-step" key={n}><span className="cs-step-number">{n}</span><div className="cs-step-icon"><Icon size={22} /></div><h3>{title}</h3><p>{desc}</p></article>)}
          </div>

          <section className="cs-section-head cs-recent-head"><div><span className="cs-kicker">YOUR ACTIVITY</span><h2>Recent reports</h2></div><button className="cs-btn secondary" onClick={() => setPage("my-reports")}>View all <ArrowRight size={15} /></button></section>
          <ReportCards reports={reports.slice(0, 3)} onOpen={() => setPage("my-reports")} />
        </main>}

        {page === "report" && <main className="cs-main narrow">
          <button className="cs-back" onClick={() => setPage("home")}>← Back to home</button>
          <div className="cs-page-heading"><span className="cs-kicker">CITIZEN REPORTING</span><h1>Report waste in your area</h1><p>Upload a photo, confirm where the waste is, then submit your report.</p></div>
          <form className="cs-report-grid" onSubmit={submitReport}>
            <section className="cs-card">
              <div className="cs-card-heading"><span className="cs-step-chip">1</span><div><h2>Waste photograph</h2><p>Clear JPG, PNG or WEBP image · max 10 MB</p></div></div>
              <input ref={fileRef} className="cs-hidden" type="file" accept="image/*" capture="environment" onChange={e => chooseFile(e.target.files?.[0])} />
              <button type="button" className={`cs-dropzone ${preview ? "has-image" : ""}`} onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]); }}>
                {preview ? <img src={preview} alt="Waste report preview" /> : <><span className="cs-upload-icon"><CloudUpload size={30} /></span><strong>Take a photo or upload an image</strong><small>Click here or drag an image into this area</small><span className="cs-btn secondary"><Upload size={15} /> Choose photo</span></>}
              </button>
              {file && <div className="cs-file-row"><ImageIcon size={17} /><span>{file.name}</span><button type="button" onClick={() => { setFile(null); setPreview(""); setDetection(null); }}>Remove</button></div>}
              <div className="cs-ai-row"><div><span className="cs-mini-icon"><ScanSearch size={18} /></span><div><strong>AI waste analysis</strong><small>{detection ? `${detection.total_detections ?? detection.detections?.length ?? 0} object(s) detected` : "Analyse the photo using the configured YOLO model"}</small></div></div><button type="button" className="cs-btn secondary" disabled={!file || busy} onClick={analyseImage}>{busy ? <LoaderCircle className="cs-spin" size={16} /> : <Sparkles size={16} />}{busy ? "Analysing" : "Analyse"}</button></div>
              {detection && <div className="cs-detection-result"><CheckCircle2 size={17} /><span><strong>AI analysis complete</strong><small>{Object.entries(detection.class_counts || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`).join(" · ") || "No objects above the model threshold"}</small></span>{detection.annotated_image_url && <a href={`${API}${detection.annotated_image_url}`} target="_blank" rel="noreferrer">View result</a>}</div>}
            </section>

            <section className="cs-card">
              <div className="cs-card-heading"><span className="cs-step-chip">2</span><div><h2>Confirm report details</h2><p>Check the location and incident details before submitting.</p></div></div>
              <label className="cs-label">Waste location <span>*</span></label>
              <div className="cs-location-row"><div className="cs-input-icon"><MapPin size={17} /><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Enter address, area or GPS coordinates" required /></div><button type="button" className="cs-btn secondary gps-btn" onClick={useMyLocation}><Navigation size={15} /> Use GPS</button></div>
              {geoMessage && <p className="cs-help">{geoMessage}</p>}
              <label className="cs-label">Incident date and time</label>
              <div className="cs-date-row"><input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} required /><input type="time" value={incidentTime} onChange={e => setIncidentTime(e.target.value)} required /></div>
              <label className="cs-label">Estimated severity</label>
              <div className="cs-severity-grid">{Object.entries(SEVERITY_POINTS).map(([name, points]) => <button type="button" key={name} className={`cs-severity ${severity === name ? "chosen" : ""} sev-${name.toLowerCase()}`} onClick={() => setSeverity(name)}><strong>{name}</strong><small>{points} points</small></button>)}</div>
              <p className="cs-help">Points shown are demo values. AI detects materials; severity is selected for this prototype.</p>
              <label className="cs-label">Additional details <span className="optional">(optional)</span></label>
              <textarea className="cs-textarea" rows="3" value={note} onChange={e => setNote(e.target.value)} placeholder="Describe the waste or nearby landmark..." />
              {error && <div className="cs-alert error"><AlertCircle size={17} />{error}</div>}
              {message && <div className="cs-alert success"><CheckCircle2 size={17} />{message}</div>}
              <button type="submit" className="cs-btn primary full"><SendIcon /> Submit waste report <ArrowRight size={17} /></button>
              <p className="cs-legal">
  <ShieldCheck size={14} />
  Reports are saved to the backend database. Clean Points are prototype rewards.
</p>
            </section>
          </form>
        </main>}

        {page === "my-reports" && <main className="cs-main">
          <div className="cs-page-heading row"><div><span className="cs-kicker">REPORT TRACKER</span><h1>My reports</h1><p>Follow each report from submission to resolution.</p></div><button className="cs-btn primary" onClick={() => { setPage("report"); setMessage(""); setError(""); }}><Camera size={17} /> Report new waste</button></div>
          <div className="cs-filter-row">{["All", ...STATUS_FLOW, "Rejected"].map(s => <button key={s} className={filter === s ? "active" : ""} onClick={() => setFilter(s)}>{s}</button>)}</div>
          <ReportCards reports={visibleReports} detailed onOpen={id => { const r = reports.find(x => x.id === id); if (r) setMessage(`Report ${r.id}: ${r.status}`); }} />
          {!visibleReports.length && <div className="cs-empty"><ClipboardList size={32} /><h3>No reports in this view</h3><p>Try another status filter or submit a new report.</p></div>}
        </main>}

        {page === "wallet" && <main className="cs-main">
          <div className="cs-page-heading"><span className="cs-kicker">REWARD YOUR IMPACT</span><h1>My Clean Points wallet</h1><p>Demo points are calculated from the selected severity of each submitted report.</p></div>
          <section className="cs-wallet-hero"><div><span>AVAILABLE DEMO POINTS</span><strong><Coins size={34} /> {citizenPoints}</strong><p>Earn points by reporting waste and helping your community.</p></div><div className="cs-wallet-art"><Leaf size={90} /></div></section>
          <div className="cs-stats-grid wallet-stats"><Stat icon={ClipboardList} label="Reports submitted" value={reports.length} note="All reports in this demo" /><Stat icon={CheckCircle2} label="Resolved reports" value={resolvedCount} note="Marked completed" color="blue" /><Stat icon={Coins} label="Points per report" value="10–100" note="Based on selected severity" color="purple" /><Stat icon={Activity} label="Impact status" value={resolvedCount ? "Growing" : "Getting started"} note="Keep contributing" color="amber" /></div>
          <section className="cs-section-head"><div><span className="cs-kicker">DEMO REWARDS CATALOGUE</span><h2>Explore potential benefits</h2></div></section>
          <div className="cs-rewards-grid">{[
            ["🌱", "Green Citizen Certificate", "Recognition for helping keep your neighbourhood clean.", 100],
            ["🚌", "Community Mobility Reward", "Example transport incentive from a participating partner.", 250],
            ["🛍️", "Local Partner Discount", "Illustrative discount from a participating local business.", 150]
          ].map(([emoji, title, desc, cost]) => <article className="cs-reward" key={title}><span>{emoji}</span><h3>{title}</h3><p>{desc}</p><div><strong><Coins size={15} /> {cost} points</strong><button className="cs-btn secondary" disabled={citizenPoints < cost} onClick={() => setMessage(`${title}: redemption is a concept demonstration. No real benefit has been issued.`)}>Redeem demo</button></div></article>)}</div>
          <p className="cs-disclaimer"><AlertCircle size={15} /> These rewards are illustrative only. Actual government benefits or redemptions require an authorised partner and a real programme.</p>
        </main>}
      </> : <>
        <nav className="cs-subnav admin-nav">
          <button className={page === "admin" ? "active" : ""} onClick={() => setPage("admin")}>Overview</button>
          <button className={page === "admin-complaints" ? "active" : ""} onClick={() => setPage("admin-complaints")}>Complaints <span>{reports.length}</span></button>
          <button className={page === "admin-trucks" ? "active" : ""} onClick={() => setPage("admin-trucks")}>Truck fleet</button>
          <span className="cs-demo-tag">OPERATIONS CONTROL CENTRE</span>
        </nav>
        {portal === "admin" && (error || message) && (
          <div style={{ maxWidth: 1320, margin: "16px auto 0", padding: "0 5.5%" }} aria-live="polite">
            {error && <div className="cs-alert error"><AlertCircle size={17} />{error}</div>}
            {message && <div className="cs-alert success"><CheckCircle2 size={17} />{message}</div>}
          </div>
        )}
        {page === "admin" && <main className="cs-main">
          <section className="cs-admin-hero"><div><Badge tone="green"><Activity size={13} /> MUNICIPAL OPERATIONS</Badge><h1>Clean city command centre</h1><p>Monitor citizen reports, prioritise waste collection, and track operational progress from one dashboard.</p></div><div className="cs-admin-hero-icon"><Recycle size={70} /></div></section>
          <div className="cs-stats-grid">
            <Stat icon={ClipboardList} label="Total complaints" value={reports.length} note="Citizen and demo reports" />
            <Stat icon={Clock3} label="Pending action" value={pendingCount} note="Submitted or under verification" color="amber" />
            <Stat icon={Activity} label="In progress" value={reports.filter(r => ["Assigned", "In Progress"].includes(r.status)).length} note="Collection underway" color="blue" />
            <Stat icon={CheckCircle2} label="Resolved" value={resolvedCount} note="Marked completed" color="purple" />
          </div>
          <section className="cs-card cs-live-map-card">
  <div className="cs-section-head inside">
    <div>
      <span className="cs-kicker">GREATER NOIDA</span>
      <h2>Waste & fleet map</h2>
    </div>

    <button
      className="cs-btn secondary"
      onClick={loadDashboardData}
      disabled={refreshing}
    >
      <RefreshCw size={15} />
      {refreshing ? "Refreshing..." : "Refresh data"}
    </button>
  </div>

  <CleanSweepMap reports={reports} trucks={trucks} />
</section>
          <div className="cs-admin-columns">
            <section className="cs-card"><div className="cs-section-head inside"><div><span className="cs-kicker">LIVE QUEUE</span><h2>Priority complaints</h2></div><button className="cs-text-btn" onClick={() => setPage("admin-complaints")}>View all <ArrowRight size={15} /></button></div>
              <div className="cs-priority-list">{[...reports].sort((a,b) => ["Critical","High","Medium","Low"].indexOf(a.severity) - ["Critical","High","Medium","Low"].indexOf(b.severity)).slice(0,5).map(r => <div className="cs-priority-row" key={r.id}><span className={`cs-priority-dot ${r.severity.toLowerCase()}`} /><div className="cs-priority-main"><strong>{r.id} · {r.category}</strong><small><MapPin size={12} /> {r.location}</small></div><div className="cs-priority-side"><Badge tone={statusTone(r.status)}>{r.status}</Badge><small>{r.severity} priority</small></div></div>)}</div>
            </section>
            <section className="cs-card"><div className="cs-section-head inside"><div><span className="cs-kicker">FLEET STATUS</span><h2>Collection trucks</h2></div><button className="cs-text-btn" onClick={() => setPage("admin-trucks")}>Manage fleet <ArrowRight size={15} /></button></div>
              <div className="cs-truck-list">{trucks.map(t => <div className="cs-truck-row" key={t.id}><span className="cs-truck-icon"><Truck size={19} /></span><div><strong>{t.id}</strong><small>{t.area}</small></div><Badge tone={t.status === "Available" ? "green" : t.status === "Collecting" ? "blue" : "amber"}>{t.status}</Badge></div>)}</div>
            </section>
          </div>
          <section className="cs-card cs-table-card"><div className="cs-section-head inside"><div><span className="cs-kicker">RECENT ACTIVITY</span><h2>Latest complaints</h2></div><button className="cs-text-btn" onClick={() => setPage("admin-complaints")}>Manage complaints <ArrowRight size={15} /></button></div><AdminTable reports={reports.slice(0,5)} updateReport={updateReport} assignTruck={assignTruck} trucks={trucks} /></section>
          <section className={`cs-admin-note cs-weather-card ${rainMode ? "rain-active" : ""}`}>
            <span className="cs-weather-icon"><CloudRain size={23} /></span>
            <div className="cs-weather-copy">
              <strong>Weather intelligence</strong>
              <p>{rainMode
                ? `SIMULATED HEAVY RAIN · ${weatherInfo?.rain_mm ?? 38} mm rainfall · ${weatherInfo?.humidity_percent ?? 95}% humidity. Review drainage, flooding and exposed-waste complaints.`
                : "Run the emergency scenario to see how the command centre responds to heavy rainfall. This is a simulation, not a live forecast."}</p>
              {rainMode && <span className="cs-weather-sim-label">● SIMULATION ACTIVE — NO REAL DISPATCH</span>}
            </div>
            <button className={`cs-btn ${rainMode ? "cs-weather-stop" : "cs-weather-start"}`} onClick={rainMode ? deactivateRainMode : activateRainMode} disabled={weatherLoading}>
              {weatherLoading ? <LoaderCircle className="cs-spin" size={16} /> : <CloudRain size={16} />}
              {weatherLoading ? "Activating..." : rainMode ? "Stop simulation" : "Activate rain mode"}
            </button>
          </section>
        </main>}
        {page === "admin-complaints" && <main className="cs-main">
          <div className="cs-page-heading row"><div><span className="cs-kicker">COMPLAINT OPERATIONS</span><h1>Complaint management</h1><p>Review reports, assign trucks, and update the collection status.</p></div><Badge tone="green">{reports.length} total reports</Badge></div>
          <section className="cs-card cs-table-card"><AdminTable reports={reports} updateReport={updateReport} assignTruck={assignTruck} trucks={trucks} /></section>
        </main>}
        {page === "admin-trucks" && <main className="cs-main">
          <div className="cs-page-heading"><span className="cs-kicker">FLEET OPERATIONS</span><h1>Truck dispatch & fleet</h1><p>Assign collection tasks and update truck availability for the demonstration.</p></div>
          <div className="cs-truck-cards">{trucks.map(t => <article className="cs-truck-card" key={t.id}><div className="cs-truck-card-top"><span className="cs-truck-icon big"><Truck size={24} /></span><Badge tone={t.status === "Available" ? "green" : t.status === "Collecting" ? "blue" : "amber"}>{t.status}</Badge></div><h3>{t.id}</h3><p><MapPin size={14} /> {t.area}</p><label className="cs-label">Update truck status</label><select value={t.status} onChange={e => setTrucks(prev => prev.map(x => x.id === t.id ? { ...x, status: e.target.value } : x))}><option>Available</option><option>Assigned</option><option>Collecting</option><option>Returning</option><option>Maintenance</option></select></article>)}</div>
          <section className="cs-card cs-table-card"><div className="cs-section-head inside"><div><span className="cs-kicker">DISPATCH QUEUE</span><h2>Unresolved complaints</h2></div></div><AdminTable reports={reports.filter(r => r.status !== "Resolved" && r.status !== "Rejected")} updateReport={updateReport} assignTruck={assignTruck} trucks={trucks} /></section>
          <p className="cs-disclaimer"><Navigation size={15} /> Truck positions and status are demonstration data, not live GPS tracking.</p>
        </main>}
      </>}

      <footer className="cs-footer"><span><span className="cs-footer-mark"><Recycle size={16} /></span> <strong>CleanSweep AI</strong> · Built for a cleaner tomorrow</span><span>Team Betabyte <i>•</i> Hackathon prototype</span></footer>
    </div>
  </>;


}
   function CleanSweepMap({ reports, trucks }) {
  const mapReports = reports.filter(
    (r) =>
      Number.isFinite(Number(r.latitude)) &&
      Number.isFinite(Number(r.longitude)) &&
      Number(r.latitude) >= -90 &&
      Number(r.latitude) <= 90 &&
      Number(r.longitude) >= -180 &&
      Number(r.longitude) <= 180 &&
      r.location !== "string" &&
      r.waste_type !== "string"
  );

  const mapTrucks = trucks.filter(
    (t) =>
      Number.isFinite(Number(t.latitude)) &&
      Number.isFinite(Number(t.longitude)) &&
      Number(t.latitude) >= -90 &&
      Number(t.latitude) <= 90 &&
      Number(t.longitude) >= -180 &&
      Number(t.longitude) <= 180
  );

  return (
    <div className="cs-map-wrap">
      <div className="cs-map-legend">
        <span><i className="cs-map-dot waste" /> Waste reports</span>
        <span><i className="cs-map-dot available" /> Available trucks</span>
        <span><i className="cs-map-dot busy" /> Busy trucks</span>
      </div>

      <MapContainer
        center={[28.4744, 77.504]}
        zoom={13}
        scrollWheelZoom
        style={{ height: "420px", width: "100%", borderRadius: "14px" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mapReports.map((report) => (
          <CircleMarker
            key={`report-${report.id}`}
            center={[Number(report.latitude), Number(report.longitude)]}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#e04f4f",
              fillOpacity: 0.95
            }}
          >
            <Popup>
              <strong>Complaint #{report.id}</strong>
              <br />
              {report.category} waste
              <br />
              Severity: {report.severity}
              <br />
              Status: {report.status}
              <br />
              {report.location}
            </Popup>
          </CircleMarker>
        ))}

        {mapTrucks.map((truck) => (
          <CircleMarker
            key={`truck-${truck.id}`}
            center={[Number(truck.latitude), Number(truck.longitude)]}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor:
                truck.status === "Available" ? "#159653" : "#e5a13a",
              fillOpacity: 0.95
            }}
          >
            <Popup>
              <strong>{truck.id}</strong>
              <br />
              {truck.name}
              <br />
              Status: {truck.status}
              <br />
              Remaining capacity: {truck.remainingCapacity ?? "—"}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <p className="cs-map-note">
        Showing saved report and truck coordinates. This is a demonstration
        map, not live vehicle tracking.
      </p>

      {!mapReports.length && (
        <p className="cs-help">
          No complaints have valid coordinates yet. Truck positions are shown
          where coordinates are available.
        </p>
      )}
    </div>
  );
}
function mapBackendReport(r) {
  const labels = {
    plastic: "Plastic",
    paper_cardboard: "Paper & cardboard",
    metal: "Metal",
    glass: "Glass"
  };

  const created = r.created_at
    ? new Date(r.created_at)
    : new Date();

  const rawSeverity = r.severity || "Medium";

  const severity =
    rawSeverity.charAt(0).toUpperCase() +
    rawSeverity.slice(1).toLowerCase();

  const rawType = r.waste_type || "Mixed waste";

  return {
    id: String(r.id),
    backendId: Number(r.id),
    filename: r.image_url
      ? r.image_url.split("/").pop()
      : "Waste report",
    category:
      labels[rawType.toLowerCase()] ||
      rawType.replaceAll("_", " "),
    severity,
    points:
      Number(r.clean_points) ||
      SEVERITY_POINTS[severity] ||
      25,
    location: r.location || "Location not provided",
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    waste_type: r.waste_type || rawType,
    date: created.toLocaleDateString("en-CA"),
    time: created.toTimeString().slice(0, 5),
    status: r.status || "Submitted",
    truck: r.assigned_truck || "",
    note: r.description || "",
    createdAt: created.toISOString(),
    totalDetections: Number(r.detection_count) || 0,
    imageUrl: r.image_url ? `${API}${r.image_url}` : "",
    annotatedImageUrl: r.annotated_image_url
      ? `${API}${r.annotated_image_url}`
      : "",
    demo: false
  };
}

function SendIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>;
}

function statusTone(status) {
  if (status === "Resolved" || status === "Verified") return "green";
  if (status === "In Progress" || status === "Assigned") return "blue";
  if (status === "Rejected") return "red";
  if (status === "Critical") return "red";
  return "amber";
}

function ReportCards({ reports, detailed = false, onOpen }) {
  if (!reports.length) return <div className="cs-empty"><ClipboardList size={32} /><h3>No reports yet</h3><p>Your submitted waste reports will appear here.</p></div>;
  return <div className="cs-report-list">{reports.map(r => <article className="cs-report-card" key={r.id}>
    <div className="cs-report-thumb"><Recycle size={25} /></div>
    <div className="cs-report-info"><div className="cs-report-id">{r.id} <Badge tone={statusTone(r.status)}>{r.status}</Badge></div><h3>{r.category} waste · {r.severity} severity</h3><p><MapPin size={14} /> {r.location}</p><small><Clock3 size={13} /> {r.date} at {r.time} · {r.filename}</small>
      {detailed && <div className="cs-progress-track">{STATUS_FLOW.slice(0, 6).map((s, i) => { const current = STATUS_FLOW.indexOf(r.status); const done = current >= i; return <div key={s} className={`cs-progress-step ${done ? "done" : ""}`}><span>{done ? <Check size={11} /> : i + 1}</span><small>{s}</small></div>; })}</div>}
      {r.truck && <div className="cs-assigned"><Truck size={14} /> Assigned collection truck: <strong>{r.truck}</strong></div>}
      {r.note && detailed && <p className="cs-report-note">{r.note}</p>}
    </div>
    <div className="cs-report-points"><strong><Coins size={15} /> +{r.points}</strong><small>Clean Points</small>{onOpen && <button onClick={() => onOpen(r.id)}>Details</button>}</div>
  </article>)}</div>;
}

function AdminTable({ reports, updateReport, assignTruck, trucks }) {
  if (!reports.length) return <div className="cs-empty"><ClipboardList size={30} /><h3>No complaints to show</h3></div>;
  return <div className="cs-table-scroll"><table className="cs-table"><thead><tr><th>Complaint</th><th>Severity</th><th>Location</th><th>Truck</th><th>Status</th><th>Actions</th></tr></thead><tbody>{reports.map(r => <tr key={r.id}><td><strong>{r.id}</strong><small>{r.category} · {r.filename}</small></td><td><Badge tone={r.severity === "Critical" || r.severity === "High" ? "red" : r.severity === "Medium" ? "amber" : "green"}>{r.severity}</Badge></td><td>{r.location}<small>{r.date} · {r.time}</small></td><td><select aria-label={`Assign truck for ${r.id}`} value={r.truck || ""} disabled={!r.backendId} title={!r.backendId ? "This is a local demo report and cannot be assigned through the backend" : "Assign a truck"} onChange={e => e.target.value && assignTruck(r.backendId || r.id, e.target.value)}><option value="">Unassigned</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}</select></td><td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td><td><select aria-label={`Update status for ${r.id}`} value={r.status} onChange={e => updateReport(r.id, { status: e.target.value })}>{[...STATUS_FLOW, "Rejected"].map(s => <option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div>;
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
:root{font-family:'DM Sans',sans-serif;color:#17352b;background:#f5f8f4;font-synthesis:none;text-rendering:optimizeLegibility}*{box-sizing:border-box}body{margin:0;min-width:320px}button,input,select,textarea{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}.cs-app{min-height:100vh;background:#f6f8f4}.cs-header{height:78px;background:#fff;border-bottom:1px solid #e8eee7;display:flex;align-items:center;justify-content:space-between;padding:0 5.5%;gap:24px}.cs-brand{display:flex;align-items:center;gap:12px;border:0;background:none;color:#183b2d;text-align:left;padding:0}.cs-logo,.cs-footer-mark{width:43px;height:43px;display:grid;place-items:center;background:#dff7e6;color:#16834b;border-radius:14px}.cs-brand strong{font:800 21px Manrope,sans-serif;letter-spacing:-.8px;display:block}.cs-brand-ai{color:#159653}.cs-brand small{display:block;font-size:9px;letter-spacing:1.25px;color:#82938a;margin-top:3px}.cs-header-right{display:flex;align-items:center;gap:9px}.cs-api{font-size:11px;color:#728278;margin-right:10px;white-space:nowrap}.cs-api i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#d5a13c;margin-right:6px}.cs-api.online i{background:#1ca765}.cs-api.offline i{background:#d45d5d}.cs-portal-tab{display:flex;align-items:center;gap:7px;padding:10px 13px;border:1px solid #e2e9e2;background:white;border-radius:11px;color:#53665b;font-size:12px;font-weight:700;white-space:nowrap}.cs-portal-tab.selected{background:#e8f8ed;color:#147642;border-color:#c9ebd3}.cs-subnav{height:56px;background:#fff;border-bottom:1px solid #e8eee7;display:flex;align-items:stretch;padding:0 5.5%;gap:25px}.cs-subnav button{border:0;background:none;color:#718177;font-size:12px;font-weight:700;padding:0 3px;position:relative}.cs-subnav button.active{color:#16834b}.cs-subnav button.active:after{content:"";position:absolute;bottom:0;left:0;right:0;height:3px;background:#24a65f;border-radius:4px 4px 0 0}.cs-subnav button span{margin-left:5px;background:#e9f6ed;color:#16834b;border-radius:20px;padding:2px 6px;font-size:10px}.cs-demo-tag{margin:auto 0 auto auto;font-size:9px;letter-spacing:1.3px;font-weight:800;color:#84948a}.cs-main{max-width:1320px;margin:0 auto;padding:38px 5.5% 64px}.cs-main.narrow{max-width:1160px}.cs-citizen-hero{min-height:390px;display:grid;grid-template-columns:1.05fr .95fr;align-items:center;background:linear-gradient(115deg,#eaf8ec,#f4faf2 65%,#e0f3e3);border:1px solid #dcefe0;border-radius:26px;overflow:hidden;padding:42px 6%;position:relative}.cs-hero-copy{position:relative;z-index:2}.cs-badge{display:inline-flex;align-items:center;gap:5px;border-radius:20px;padding:6px 10px;font-size:10px;line-height:1.3;font-weight:800;letter-spacing:.25px;background:#eef1ee;color:#68776d;white-space:nowrap}.cs-badge.green{background:#dff6e5;color:#18814a}.cs-badge.blue{background:#e5efff;color:#3a69b1}.cs-badge.amber{background:#fff2d9;color:#9b6c15}.cs-badge.red{background:#ffebeb;color:#b94343}.cs-citizen-hero h1,.cs-page-heading h1,.cs-admin-hero h1{font:800 clamp(32px,4vw,49px)/1.12 Manrope,sans-serif;letter-spacing:-1.9px;margin:22px 0 14px;color:#18392b}.cs-citizen-hero h1 em{font-style:normal;color:#1a9a53}.cs-hero-copy>p,.cs-page-heading>p,.cs-admin-hero p{max-width:570px;color:#718078;line-height:1.75;font-size:14px;margin:0 0 25px}.cs-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:11px;padding:11px 14px;font-size:12px;font-weight:800;border:1px solid transparent;transition:.15s}.cs-btn.primary{background:#188b4b;color:white;box-shadow:0 5px 13px #188b4b20}.cs-btn.primary:hover{background:#11763d}.cs-btn.primary.large{padding:14px 18px;font-size:13px}.cs-btn.secondary{background:#fff;border-color:#dfe8df;color:#425c4c}.cs-btn.secondary:hover{border-color:#9dcdaa;background:#f8fff9}.cs-btn.full{width:100%;margin-top:17px}.cs-hero-proof{display:flex;gap:18px;flex-wrap:wrap;margin-top:25px}.cs-hero-proof span{display:flex;align-items:center;gap:6px;color:#648071;font-size:10px;font-weight:700}.cs-hero-proof svg{color:#259b56}.cs-hero-visual{height:300px;position:relative;display:grid;place-items:center}.cs-visual-ring{position:absolute;border:1px solid #c2e5cb;border-radius:50%}.ring1{width:265px;height:265px}.ring2{width:205px;height:205px;border-style:dashed}.cs-visual-center{width:150px;height:150px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:linear-gradient(140deg,#d5f5dc,#fff);color:#20934f;box-shadow:0 20px 50px #33794a18}.cs-visual-center span{font-size:9px;font-weight:800;letter-spacing:1px;text-align:center;line-height:1.5}.cs-float-card{position:absolute;display:flex;align-items:center;gap:10px;background:white;border:1px solid #e6eee5;padding:12px 15px;border-radius:15px;box-shadow:0 12px 28px #264b3210}.cs-float-card strong,.cs-float-card small{display:block}.cs-float-card strong{font-size:11px}.cs-float-card small{font-size:9px;color:#8a978e;margin-top:4px}.cs-float-card>svg{color:#20934f}.cs-float-icon{color:#1e9a55}.float-top{top:25px;right:-5px}.float-bottom{bottom:24px;left:0}.cs-stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin:24px 0 42px}.cs-stat{padding:20px;background:#fff;border:1px solid #e7eee6;border-radius:17px;min-width:0}.cs-stat-icon{width:37px;height:37px;border-radius:11px;display:grid;place-items:center;background:#e4f7e9;color:#18884a;margin-bottom:16px}.cs-stat-icon.amber{background:#fff3dd;color:#b17c18}.cs-stat-icon.blue{background:#e8f0ff;color:#4a73bd}.cs-stat-icon.purple{background:#f1eaff;color:#8458bd}.cs-stat-label{font-size:11px;color:#748278;font-weight:700}.cs-stat-value{font:800 27px Manrope,sans-serif;letter-spacing:-.8px;margin:5px 0;color:#1c392c}.cs-muted{color:#89968d}.cs-small{font-size:10px}.cs-section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:0 0 18px}.cs-section-head h2{font:800 22px Manrope,sans-serif;letter-spacing:-.7px;margin:6px 0 0}.cs-kicker{font-size:9px;letter-spacing:1.5px;font-weight:800;color:#219454}.cs-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.cs-step{position:relative;padding:24px 21px;background:#fff;border:1px solid #e7eee6;border-radius:17px}.cs-step-number{position:absolute;right:19px;top:18px;font:800 12px Manrope;color:#b7c7bb}.cs-step-icon{width:43px;height:43px;display:grid;place-items:center;background:#e8f8ed;color:#188b4b;border-radius:13px}.cs-step h3{font:800 15px Manrope;margin:18px 0 7px}.cs-step p{font-size:11px;color:#7a887e;line-height:1.7;margin:0}.cs-recent-head{margin-top:43px}.cs-report-list{display:grid;gap:12px}.cs-report-card{display:flex;align-items:center;gap:17px;background:white;border:1px solid #e6ede5;border-radius:16px;padding:17px 19px;min-width:0}.cs-report-thumb{width:48px;height:48px;flex-shrink:0;display:grid;place-items:center;background:#e5f7e9;color:#1c9251;border-radius:13px}.cs-report-info{flex:1;min-width:0}.cs-report-id{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px;color:#8a978d;font-weight:700}.cs-report-info h3{font-size:13px;margin:7px 0;color:#284536}.cs-report-info p,.cs-report-info small{display:flex;align-items:center;gap:5px;color:#7b8a80;font-size:10px;margin:5px 0}.cs-report-points{display:flex;flex-direction:column;align-items:flex-end;gap:5px;white-space:nowrap}.cs-report-points strong{display:flex;align-items:center;gap:4px;color:#188b4b;font-size:13px}.cs-report-points small{font-size:9px;color:#89968d}.cs-report-points button{border:0;background:none;color:#198b4a;font-size:10px;font-weight:800}.cs-page-heading{margin:12px 0 27px}.cs-page-heading h1{font-size:35px;margin:9px 0}.cs-page-heading>p{margin:0}.cs-page-heading.row{display:flex;align-items:center;justify-content:space-between;gap:20px}.cs-back{border:0;background:none;color:#16884a;font-size:12px;font-weight:800;padding:0;margin-bottom:20px}.cs-report-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.cs-card{background:#fff;border:1px solid #e5ece4;border-radius:18px;padding:24px;min-width:0}.cs-card-heading{display:flex;gap:12px;align-items:flex-start;margin-bottom:23px}.cs-step-chip{width:30px;height:30px;display:grid;place-items:center;flex-shrink:0;border-radius:10px;background:#e3f7e8;color:#16894a;font-size:12px;font-weight:800}.cs-card-heading h2{font:800 16px Manrope;margin:1px 0 5px}.cs-card-heading p{font-size:10px;color:#849188;margin:0;line-height:1.6}.cs-hidden{display:none}.cs-dropzone{width:100%;min-height:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;background:#f8fbf7;border:1px dashed #cbd9cc;border-radius:15px;color:#345140;padding:18px}.cs-dropzone:hover{border-color:#39a463;background:#f4fbf5}.cs-dropzone>img{width:100%;height:275px;object-fit:contain;border-radius:10px}.cs-upload-icon{width:54px;height:54px;display:grid;place-items:center;border-radius:16px;background:#e3f7e8;color:#198c4b}.cs-dropzone strong{font-size:12px}.cs-dropzone small{font-size:10px;color:#87958b}.cs-file-row{display:flex;align-items:center;gap:8px;padding:10px 0;color:#65756a;font-size:10px}.cs-file-row span{flex:1;overflow:hidden;text-overflow:ellipsis}.cs-file-row button{border:0;background:none;color:#b94a4a;font-size:10px;font-weight:700}.cs-ai-row{margin-top:18px;border:1px solid #e6eee5;background:#fbfdfb;border-radius:13px;padding:13px;display:flex;align-items:center;justify-content:space-between;gap:10px}.cs-ai-row>div{display:flex;align-items:center;gap:9px}.cs-mini-icon{display:grid;place-items:center;width:35px;height:35px;border-radius:10px;background:#e5f7e9;color:#168b4b}.cs-ai-row strong,.cs-ai-row small{display:block}.cs-ai-row strong{font-size:11px}.cs-ai-row small{font-size:9px;color:#859288;margin-top:4px;line-height:1.5}.cs-detection-result{display:flex;align-items:flex-start;gap:9px;padding:12px;margin-top:12px;border-radius:11px;background:#eaf8ee;color:#18864a;font-size:11px}.cs-detection-result span{flex:1}.cs-detection-result strong,.cs-detection-result small{display:block}.cs-detection-result small{color:#6f8274;margin-top:4px;text-transform:capitalize}.cs-detection-result a{color:#16884a;font-size:10px;font-weight:800}.cs-label{display:block;font-size:11px;font-weight:800;color:#425c4a;margin:17px 0 8px}.cs-label>span{color:#db5959}.cs-label .optional{color:#9aa69c;font-weight:500}.cs-location-row{display:flex;gap:8px}.cs-input-icon{display:flex;align-items:center;gap:8px;border:1px solid #dfe8de;border-radius:10px;padding:0 10px;flex:1;min-width:0;color:#829187}.cs-input-icon input{width:100%;min-width:0;border:0;outline:none;padding:12px 0;font-size:11px;color:#334e3d;background:transparent}.gps-btn{white-space:nowrap;padding:9px 10px}.cs-date-row{display:grid;grid-template-columns:1fr 1fr;gap:9px}.cs-date-row input,.cs-truck-card select,.cs-table select{width:100%;min-width:0;border:1px solid #dfe8de;border-radius:9px;padding:10px;font-size:11px;background:#fff;color:#46594c}.cs-severity-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.cs-severity{display:flex;flex-direction:column;gap:5px;align-items:center;padding:11px 4px;border:1px solid #e2e9e1;background:white;border-radius:10px;color:#5e6d61}.cs-severity strong{font-size:10px}.cs-severity small{font-size:9px}.cs-severity.chosen{border-color:#239b55;box-shadow:0 0 0 2px #dff5e5;background:#f3fbf4;color:#188448}.sev-critical.chosen{border-color:#d95555;background:#fff5f5;color:#b63838}.cs-help{font-size:10px;color:#8b988f;line-height:1.6;margin:8px 0}.cs-textarea{width:100%;border:1px solid #dfe8de;border-radius:10px;padding:12px;resize:vertical;font-size:11px;outline-color:#64bb7e}.cs-alert{display:flex;align-items:flex-start;gap:8px;padding:11px 12px;border-radius:10px;margin-top:12px;font-size:11px;line-height:1.5}.cs-alert.error{background:#fff0f0;color:#b13d3d}.cs-alert.success{background:#e8f8ed;color:#197e44}.cs-legal{display:flex;align-items:center;gap:5px;justify-content:center;font-size:9px;color:#94a097;margin:12px 0 0}.cs-spin{animation:cs-spin 1s linear infinite}@keyframes cs-spin{to{transform:rotate(360deg)}}.cs-filter-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px}.cs-filter-row button{border:1px solid #e0e8df;background:white;border-radius:20px;padding:8px 12px;font-size:10px;color:#647469;font-weight:700}.cs-filter-row button.active{background:#188b4b;color:white;border-color:#188b4b}.cs-progress-track{display:flex;align-items:flex-start;gap:0;margin:20px 0 8px}.cs-progress-step{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;position:relative}.cs-progress-step:not(:last-child):after{content:"";position:absolute;height:2px;background:#e1e9e1;top:10px;left:calc(50% + 11px);width:calc(100% - 22px)}.cs-progress-step.done:not(:last-child):after{background:#45ad6c}.cs-progress-step>span{z-index:1;width:21px;height:21px;display:grid;place-items:center;border-radius:50%;border:1px solid #dce6dc;background:#fff;color:#91a095;font-size:9px}.cs-progress-step.done>span{background:#1e9953;border-color:#1e9953;color:white}.cs-progress-step small{font-size:8px;color:#7e8b81;line-height:1.3}.cs-assigned{display:flex;align-items:center;gap:5px;color:#5c7564;font-size:10px;margin-top:9px}.cs-report-note{font-size:10px!important;color:#7e8b81!important}.cs-empty{text-align:center;background:white;border:1px dashed #dbe6da;border-radius:16px;padding:45px 20px;color:#789080}.cs-empty svg{color:#38a463}.cs-empty h3{font:800 16px Manrope;color:#304c3b;margin:12px 0 6px}.cs-empty p{font-size:11px;margin:0}.cs-wallet-hero{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(110deg,#187f46,#26a45a);color:#fff;border-radius:22px;padding:32px 38px;overflow:hidden;position:relative}.cs-wallet-hero>div:first-child>span{font-size:10px;letter-spacing:1.4px;font-weight:800;color:#c7f1d3}.cs-wallet-hero strong{display:flex;align-items:center;gap:12px;font:800 48px Manrope;margin:13px 0}.cs-wallet-hero p{font-size:12px;color:#d6f1dc;margin:0}.cs-wallet-art{width:150px;height:150px;border:1px solid #ffffff45;border-radius:50%;display:grid;place-items:center;color:#c4f3d0;background:#ffffff10}.wallet-stats{margin-bottom:35px}.cs-rewards-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.cs-reward{background:#fff;border:1px solid #e5ece4;border-radius:16px;padding:20px}.cs-reward>span{font-size:28px}.cs-reward h3{font:800 14px Manrope;margin:14px 0 7px}.cs-reward p{font-size:10px;line-height:1.7;color:#7c8b80;min-height:50px}.cs-reward>div{display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:15px}.cs-reward>div strong{display:flex;align-items:center;gap:5px;color:#198b4b;font-size:11px}.cs-reward .cs-btn{font-size:10px;padding:8px}.cs-disclaimer{display:flex;gap:8px;align-items:flex-start;font-size:10px;color:#8a958c;line-height:1.6;margin-top:18px}.cs-disclaimer svg{flex-shrink:0}.cs-admin-hero{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(110deg,#e9f7eb,#f7fbf5);border:1px solid #dcefe0;border-radius:22px;padding:30px 34px;margin-bottom:23px}.cs-admin-hero h1{font-size:34px;margin:13px 0 8px}.cs-admin-hero p{font-size:12px;margin:0;max-width:650px}.cs-admin-hero-icon{width:115px;height:115px;display:grid;place-items:center;border-radius:30px;background:#d7f1de;color:#1d9851}.cs-admin-columns{display:grid;grid-template-columns:1fr 1fr;gap:17px;margin-bottom:18px}.cs-section-head.inside{margin:0 0 18px;align-items:center}.cs-section-head.inside h2{font-size:17px}.cs-text-btn{display:flex;align-items:center;gap:5px;border:0;background:none;color:#18894a;font-size:10px;font-weight:800;white-space:nowrap}.cs-priority-list,.cs-truck-list{display:grid;gap:0}.cs-priority-row,.cs-truck-row{display:flex;align-items:center;gap:11px;padding:13px 0;border-top:1px solid #eef2ed}.cs-priority-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;background:#e5b44d}.cs-priority-dot.critical,.cs-priority-dot.high{background:#dc5d5d}.cs-priority-dot.low{background:#35a568}.cs-priority-main{flex:1;min-width:0}.cs-priority-main strong,.cs-priority-main small,.cs-priority-side small,.cs-truck-row strong,.cs-truck-row small{display:flex;align-items:center;gap:4px}.cs-priority-main strong,.cs-truck-row strong{font-size:10px;color:#304b3b}.cs-priority-main small,.cs-priority-side small,.cs-truck-row small{font-size:9px;color:#8b988f;margin-top:5px}.cs-priority-side{display:flex;flex-direction:column;align-items:flex-end;gap:4px}.cs-truck-icon{width:38px;height:38px;display:grid;place-items:center;background:#e8f7eb;border-radius:11px;color:#20894c;flex-shrink:0}.cs-truck-icon.big{width:49px;height:49px}.cs-truck-row>div:nth-child(2){flex:1}.cs-table-card{margin-top:18px}.cs-table-scroll{width:100%;overflow:auto}.cs-table{border-collapse:collapse;width:100%;min-width:780px;text-align:left}.cs-table th{font-size:9px;letter-spacing:.7px;text-transform:uppercase;color:#8b988e;background:#f8faf7;padding:13px 12px;border-bottom:1px solid #e7eee6}.cs-table td{padding:13px 12px;border-bottom:1px solid #eef2ed;font-size:10px;color:#607065;vertical-align:middle}.cs-table td strong,.cs-table td small{display:block}.cs-table td strong{color:#2e4938;font-size:10px}.cs-table td small{font-size:9px;color:#89958c;margin-top:5px}.cs-table select{padding:8px;font-size:10px;min-width:105px}.cs-truck-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}.cs-truck-card{background:white;border:1px solid #e5ece4;border-radius:16px;padding:18px}.cs-truck-card-top{display:flex;justify-content:space-between;align-items:center;gap:5px}.cs-truck-card h3{font:800 17px Manrope;margin:17px 0 7px}.cs-truck-card p{display:flex;align-items:center;gap:5px;color:#7e8c81;font-size:10px;margin:0 0 15px}.cs-truck-card .cs-label{margin-top:14px}.cs-admin-note{display:flex;align-items:flex-start;gap:12px;padding:17px 19px;border-radius:14px;background:#eef5ff;color:#4b6e9e;margin-top:18px}.cs-admin-note>div{flex:1}.cs-admin-note strong{font-size:11px}.cs-admin-note p{font-size:10px;line-height:1.6;color:#6c83a1;margin:5px 0 0}.cs-footer{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:20px 5.5%;background:#fff;border-top:1px solid #e5ece4;color:#8a978d;font-size:10px}.cs-footer>span:first-child{display:flex;align-items:center;gap:8px}.cs-footer strong{color:#425b4a}.cs-footer-mark{width:27px;height:27px;border-radius:8px}.cs-footer i{font-style:normal;color:#22a15a;margin:0 4px}
@media(max-width:950px){.cs-header{padding:0 3%;}.cs-header-right{gap:5px}.cs-api{display:none}.cs-subnav{padding:0 3%}.cs-main{padding:28px 3% 48px}.cs-citizen-hero{padding:30px 4%}.cs-hero-proof{gap:10px}.cs-stats-grid{gap:10px}.cs-stat{padding:16px}.cs-admin-columns{grid-template-columns:1fr}.cs-truck-cards{grid-template-columns:repeat(2,1fr)}}
@media(max-width:700px){.cs-header{height:auto;min-height:72px;align-items:flex-start;padding:15px 4%;flex-direction:column;gap:12px}.cs-header-right{width:100%;flex-wrap:wrap}.cs-portal-tab{flex:1;justify-content:center;font-size:10px;padding:9px 6px}.cs-subnav{gap:16px;overflow-x:auto;white-space:nowrap;padding:0 4%;height:51px}.cs-subnav button{font-size:10px}.cs-demo-tag{display:none}.cs-main{padding:22px 4% 40px}.cs-citizen-hero{grid-template-columns:1fr;padding:29px 23px}.cs-citizen-hero h1{font-size:37px}.cs-hero-visual{height:230px;margin-top:10px}.ring1{width:210px;height:210px}.ring2{width:165px;height:165px}.cs-visual-center{width:120px;height:120px}.cs-visual-center>svg{width:60px}.float-top{right:0;top:5px}.float-bottom{left:0;bottom:0}.cs-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin:17px 0 32px}.cs-stat{padding:14px}.cs-stat-value{font-size:23px}.cs-steps{grid-template-columns:repeat(2,1fr)}.cs-section-head h2{font-size:18px}.cs-report-card{padding:13px;gap:10px;align-items:flex-start}.cs-report-thumb{width:38px;height:38px}.cs-report-points{font-size:10px}.cs-report-info h3{font-size:11px}.cs-report-info small{line-height:1.5}.cs-report-grid{grid-template-columns:1fr}.cs-card{padding:17px}.cs-page-heading h1{font-size:29px}.cs-page-heading.row{align-items:flex-start;flex-direction:column}.cs-severity-grid{grid-template-columns:repeat(4,1fr)}.cs-progress-step small{font-size:7px}.cs-rewards-grid{grid-template-columns:1fr}.cs-reward p{min-height:0}.cs-wallet-hero{padding:25px 22px}.cs-wallet-hero strong{font-size:36px}.cs-wallet-art{width:80px;height:80px}.cs-wallet-art svg{width:52px}.cs-admin-hero{padding:24px 20px}.cs-admin-hero h1{font-size:27px}.cs-admin-hero-icon{width:65px;height:65px;border-radius:18px;flex-shrink:0}.cs-admin-hero-icon svg{width:40px}.cs-truck-cards{grid-template-columns:1fr 1fr}.cs-footer{padding:18px 4%;align-items:flex-start;flex-direction:column}.cs-location-row{flex-direction:column}.gps-btn{align-self:flex-start}.cs-report-info{min-width:0}.cs-report-id{font-size:9px}.cs-report-points strong{font-size:11px}}
@media(max-width:390px){.cs-truck-cards{grid-template-columns:1fr}.cs-hero-proof{flex-direction:column}.cs-date-row{grid-template-columns:1fr}.cs-severity-grid{gap:4px}.cs-severity strong{font-size:9px}.cs-severity small{font-size:8px}}
/* Whole-app simulated storm mode */
.cs-rain-overlay{position:fixed;inset:0;z-index:4;pointer-events:none;overflow:hidden;background:linear-gradient(180deg,rgba(5,18,39,.18),rgba(2,15,32,.34))}
.cs-rain-overlay:before,.cs-rain-overlay:after{content:"";position:absolute;inset:-100% -40%;background-image:repeating-linear-gradient(105deg,transparent 0 17px,rgba(183,220,255,.44) 18px,transparent 19px 43px);background-size:92px 128px;animation:cs-rain-fall .58s linear infinite}
.cs-rain-overlay:after{opacity:.38;filter:blur(1px);background-size:143px 177px;animation-duration:.9s}
@keyframes cs-rain-fall{from{transform:translate3d(-2%,-12%,0)}to{transform:translate3d(2%,12%,0)}}
.cs-app.cs-rain-mode{background:#071526!important;color:#e7f3ff!important;isolation:isolate}
.cs-app.cs-rain-mode>.cs-header,.cs-app.cs-rain-mode>.cs-subnav,.cs-app.cs-rain-mode>.cs-main,.cs-app.cs-rain-mode>.cs-footer{position:relative;z-index:5}
.cs-app.cs-rain-mode .cs-header,.cs-app.cs-rain-mode .cs-subnav,.cs-app.cs-rain-mode .cs-stat,.cs-app.cs-rain-mode .cs-card,.cs-app.cs-rain-mode .cs-step,.cs-app.cs-rain-mode .cs-report-card,.cs-app.cs-rain-mode .cs-truck-card,.cs-app.cs-rain-mode .cs-admin-note,.cs-app.cs-rain-mode .cs-reward,.cs-app.cs-rain-mode .cs-float-card{background:rgba(7,25,46,.94)!important;border-color:rgba(111,170,211,.38)!important;color:#e7f3ff!important;backdrop-filter:blur(5px)}
.cs-app.cs-rain-mode .cs-brand,.cs-app.cs-rain-mode .cs-stat-value,.cs-app.cs-rain-mode .cs-report-info h3,.cs-app.cs-rain-mode .cs-section-head h2,.cs-app.cs-rain-mode .cs-step h3,.cs-app.cs-rain-mode .cs-float-card strong,.cs-app.cs-rain-mode .cs-admin-hero h1,.cs-app.cs-rain-mode .cs-page-heading h1{color:#e7f3ff!important}
.cs-app.cs-rain-mode .cs-citizen-hero,.cs-app.cs-rain-mode .cs-admin-hero,.cs-app.cs-rain-mode .cs-wallet-hero{background:linear-gradient(125deg,#092943,#101b36)!important;border-color:#245274!important}
.cs-app.cs-rain-mode .cs-muted,.cs-app.cs-rain-mode .cs-small,.cs-app.cs-rain-mode .cs-report-info p,.cs-app.cs-rain-mode .cs-report-info small,.cs-app.cs-rain-mode .cs-step p,.cs-app.cs-rain-mode .cs-admin-hero p,.cs-app.cs-rain-mode .cs-page-heading>p{color:#a9c0d4!important}
.cs-app.cs-rain-mode .cs-subnav button{color:#b5cadd}
.cs-app.cs-rain-mode .cs-table{color:#e7f3ff}
.cs-app.cs-rain-mode .cs-table th{background:#102a43;color:#c7d9e9}
.cs-app.cs-rain-mode .cs-table td{border-color:#28445c}
.cs-app.cs-rain-mode .cs-table select,.cs-app.cs-rain-mode select,.cs-app.cs-rain-mode input,.cs-app.cs-rain-mode textarea{background:#10253a!important;color:#e7f3ff!important;border-color:#36546d!important}
.cs-app.cs-rain-mode .cs-footer{color:#a9c0d4}
.cs-weather-emergency-banner{position:relative;z-index:6;display:flex;align-items:center;gap:14px;padding:15px 5.5%;background:linear-gradient(100deg,#7f1724,#bd2636);color:#fff;border-bottom:1px solid #ed6572;box-shadow:0 8px 24px rgba(86,10,22,.22)}
.cs-weather-banner-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}
.cs-weather-banner-copy strong{font-size:12px;letter-spacing:.7px}
.cs-weather-banner-copy span{font-size:12px;line-height:1.5}
.cs-weather-banner-copy small{font-size:10px;opacity:.8}
.cs-weather-stop{border:1px solid rgba(255,255,255,.5)!important;background:rgba(35,0,0,.18)!important;color:#fff!important;white-space:nowrap}
.cs-weather-card{display:flex;align-items:center;gap:14px;margin-top:18px;padding:19px 21px;border:1px solid #dfe8df;border-radius:16px;background:#fff}
.cs-weather-icon{display:grid;place-items:center;flex-shrink:0;width:44px;height:44px;border-radius:13px;background:#e4f1ff;color:#2569a6}
.cs-weather-copy{flex:1;min-width:0}
.cs-weather-copy>strong{display:block;font-size:13px}
.cs-weather-copy p{margin:5px 0 0;font-size:12px;line-height:1.6;color:#718177}
.cs-weather-sim-label{display:inline-block;margin-top:7px;font-size:10px;font-weight:800;letter-spacing:.4px;color:#ff8790}
.cs-weather-start{background:#126baf!important;color:#fff!important;border-color:#126baf!important;white-space:nowrap}
.cs-weather-card.rain-active{border-color:#a33a48;background:linear-gradient(100deg,rgba(72,18,33,.96),rgba(9,31,53,.96))!important}
.cs-weather-card.rain-active .cs-weather-icon{background:#642b3b;color:#ffd5d8}
@media(max-width:680px){.cs-weather-emergency- banner{align-items:flex-start;flex-wrap:wrap;padding:14px 5%}.cs-weather-banner-copy{flex-basis:calc(100% - 44px)}.cs-weather-stop{margin-left:38px}.cs-weather-card{align-items:flex-start;flex-wrap:wrap}.cs-weather-copy{flex-basis:calc(100% - 60px)}.cs-weather-start,.cs-weather-card .cs-weather-stop{margin-left:58px}}
@media(prefers-reduced-motion:reduce){.cs-rain-overlay:before,.cs-rain-overlay:after{animation:none}}
`;

