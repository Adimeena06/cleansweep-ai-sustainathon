import { useCallback, useEffect, useState } from "react";
import {
  Truck,
  MapPin,
  Navigation,
  RefreshCw,
  Upload,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Image as ImageIcon,
  LoaderCircle,
  ClipboardList,
  Camera,
} from "lucide-react";
import "./DriverPortal.css";

const API = "";

function getTruckId(truck) {
  return String(truck?.truck_id ?? truck?.id ?? "");
}

function getImageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API}${path.startsWith("/") ? path : `/${path}`}`;
}

function statusClass(status = "") {
  return String(status).toLowerCase().replace(/\s+/g, "-");
}

function DriverPortal({ trucks = [] }) {
  const [selectedTruck, setSelectedTruck] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyJob, setBusyJob] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("active");
  const [proofs, setProofs] = useState({});
  const [notes, setNotes] = useState({});

  // Select the first available truck.
  useEffect(() => {
    if (!selectedTruck && trucks.length > 0) {
      setSelectedTruck(getTruckId(trucks[0]));
    }
  }, [trucks, selectedTruck]);

  // Load jobs assigned to the selected truck.
  const loadJobs = useCallback(async () => {
    if (!selectedTruck) {
      setJobs([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API}/api/driver/jobs/${encodeURIComponent(selectedTruck)}`
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load assigned jobs.");
      }

      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err) {
      setError(
        `${err.message} Check that the backend is running and the selected truck exists.`
      );
    } finally {
      setLoading(false);
    }
  }, [selectedTruck]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Start a collection job.
  async function startJob(job) {
    setBusyJob(job.id);
    setError("");
    setMessage("");

    try {
      const form = new FormData();
      form.append("truck_id", selectedTruck);

      const response = await fetch(
        `${API}/api/driver/jobs/${job.id}/start`,
        {
          method: "POST",
          body: form,
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Could not start this job.");
      }

      setMessage(`Complaint #${job.id} is now In Progress.`);
      await loadJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyJob(null);
    }
  }

  // Complete a job only after a proof photo is selected.
  async function completeJob(job) {
    const photo = proofs[job.id];

    if (!photo) {
      setError(`Upload a completion photo for complaint #${job.id} first.`);
      return;
    }

    setBusyJob(job.id);
    setError("");
    setMessage("");

    try {
      const form = new FormData();
      form.append("truck_id", selectedTruck);
      form.append("notes", notes[job.id] || "");
      form.append("photo", photo);

      const response = await fetch(
        `${API}/api/driver/jobs/${job.id}/complete`,
        {
          method: "POST",
          body: form,
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Could not complete this job.");
      }

      setMessage(
        `Complaint #${job.id} completed successfully. The proof photo was saved.`
      );

      setProofs((previous) => {
        const next = { ...previous };
        delete next[job.id];
        return next;
      });

      setNotes((previous) => {
        const next = { ...previous };
        delete next[job.id];
        return next;
      });

      await loadJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyJob(null);
    }
  }

  // Filter jobs.
  const visibleJobs = jobs.filter((job) => {
    if (filter === "active") {
      return !["Resolved", "Rejected"].includes(job.status);
    }

    if (filter === "completed") {
      return job.status === "Resolved";
    }

    return true;
  });

  const activeCount = jobs.filter(
    (job) => !["Resolved", "Rejected"].includes(job.status)
  ).length;

  const completedCount = jobs.filter(
    (job) => job.status === "Resolved"
  ).length;

  return (
    <section className="driver-portal">
      {/* Header */}
      <div className="driver-hero">
        <div className="driver-hero-copy">
          <div className="driver-eyebrow">
            <Truck size={15} />
            CLEANSWEEP AI · FLEET OPERATIONS
          </div>

          <h1>Driver Portal</h1>

          <p>
            Manage your assigned waste collection jobs, navigate to
            locations, and submit photo proof when cleanup is complete.
          </p>
        </div>

        <div className="driver-hero-icon">
          <Truck size={44} strokeWidth={1.5} />
        </div>
      </div>

      {/* Demo notice */}
      <div className="driver-demo-notice">
        <AlertTriangle size={17} />
        <span>
          <strong>Demo mode:</strong> Select your assigned truck below.
          This selector is not driver authentication.
        </span>
      </div>

      {/* Truck selector and refresh */}
      <div className="driver-toolbar">
        <label className="driver-truck-select">
          <span>
            <Truck size={16} />
            Select your truck
          </span>

          <select
            value={selectedTruck}
            onChange={(event) => setSelectedTruck(event.target.value)}
          >
            <option value="">Choose a truck</option>

            {trucks.map((truck) => {
              const id = getTruckId(truck);

              return (
                <option key={id} value={id}>
                  {id}
                  {truck.name ? ` — ${truck.name}` : ""}
                </option>
              );
            })}
          </select>
        </label>

        <button
          type="button"
          className="driver-refresh-button"
          onClick={loadJobs}
          disabled={!selectedTruck || loading}
        >
          {loading ? (
            <LoaderCircle className="driver-spin" size={17} />
          ) : (
            <RefreshCw size={17} />
          )}
          Refresh jobs
        </button>
      </div>

      {/* Statistics */}
      <div className="driver-stats">
        <div className="driver-stat-card">
          <span>Assigned jobs</span>
          <strong>{jobs.length}</strong>
          <ClipboardList size={21} />
        </div>

        <div className="driver-stat-card">
          <span>Active jobs</span>
          <strong>{activeCount}</strong>
          <Clock3 size={21} />
        </div>

        <div className="driver-stat-card">
          <span>Completed jobs</span>
          <strong>{completedCount}</strong>
          <CheckCircle2 size={21} />
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="driver-alert driver-alert-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="driver-alert driver-alert-success" role="status">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      )}

      {/* Job list heading and filters */}
      <div className="driver-jobs-heading">
        <div>
          <h2>My Collection Jobs</h2>
          <p>Jobs are loaded from the CleanSweep AI backend.</p>
        </div>

        <div className="driver-filters">
          {[
            ["active", "Active"],
            ["completed", "Completed"],
            ["all", "All jobs"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty and loading states */}
      {!selectedTruck ? (
        <div className="driver-empty">
          <Truck size={36} />
          <h3>Select a truck</h3>
          <p>
            Select a truck from your existing fleet to load its assignments.
          </p>
        </div>
      ) : loading && jobs.length === 0 ? (
        <div className="driver-empty">
          <LoaderCircle className="driver-spin" size={32} />
          <p>Loading assigned jobs...</p>
        </div>
      ) : visibleJobs.length === 0 ? (
        <div className="driver-empty">
          <ClipboardList size={36} />
          <h3>No jobs to display</h3>
          <p>
            There are no {filter === "all" ? "" : `${filter} `}
            assignments for truck {selectedTruck}. Assign a complaint
            through the Admin Dashboard, then refresh.
          </p>
        </div>
      ) : (
        <div className="driver-job-list">
          {visibleJobs.map((job) => {
            const completed = job.status === "Resolved";
            const rejected = job.status === "Rejected";
            const completion = job.completion;

            const originalImage = getImageUrl(job.image_url);
            const proofImage = getImageUrl(completion?.after_image_url);

            const hasCoordinates =
              job.latitude !== null &&
              job.latitude !== undefined &&
              job.longitude !== null &&
              job.longitude !== undefined &&
              Number.isFinite(Number(job.latitude)) &&
              Number.isFinite(Number(job.longitude));

            const mapsUrl = hasCoordinates
              ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  `${job.latitude},${job.longitude}`
                )}&travelmode=driving`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  job.location || ""
                )}`;

            return (
              <article className="driver-job-card" key={job.id}>
                {/* Job title and status */}
                <div className="driver-job-top">
                  <div>
                    <span className="driver-complaint-id">
                      COMPLAINT #{job.id}
                    </span>

                    <h3>
                      {job.waste_type || job.title || "Waste collection"}
                    </h3>

                    <p className="driver-job-description">
                      {job.description || "No additional complaint details."}
                    </p>
                  </div>

                  <span
                    className={`driver-status ${statusClass(job.status)}`}
                  >
                    {job.status}
                  </span>
                </div>

                {/* Job information */}
                <div className="driver-job-details">
                  <div>
                    <span>Severity</span>
                    <strong
                      className={`driver-severity ${statusClass(
                        job.severity
                      )}`}
                    >
                      {job.severity || "Not specified"}
                    </strong>
                  </div>

                  <div>
                    <span>Assigned truck</span>
                    <strong>{job.assigned_truck || selectedTruck}</strong>
                  </div>

                  <div className="driver-location-detail">
                    <span>Collection location</span>
                    <strong>
                      <MapPin size={15} />
                      {job.location || "Location not provided"}
                    </strong>
                  </div>

                  <div>
                    <span>GPS coordinates</span>
                    <strong>
                      {hasCoordinates
                        ? `${job.latitude}, ${job.longitude}`
                        : "Coordinates unavailable"}
                    </strong>
                  </div>
                </div>

                {/* Original image and completion proof */}
                <div className="driver-image-grid">
                  <div className="driver-image-panel">
                    <div className="driver-image-heading">
                      <ImageIcon size={16} />
                      Original complaint
                    </div>

                    {originalImage ? (
                      <a
                        href={originalImage}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={originalImage}
                          alt={`Original waste complaint ${job.id}`}
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div className="driver-no-image">
                        Original image unavailable
                      </div>
                    )}
                  </div>

                  {completion && (
                    <div className="driver-image-panel">
                      <div className="driver-image-heading">
                        <CheckCircle2 size={16} />
                        Completion proof
                      </div>

                      {proofImage ? (
                        <a
                          href={proofImage}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={proofImage}
                            alt={`Completion proof for complaint ${job.id}`}
                            loading="lazy"
                          />
                        </a>
                      ) : (
                        <div className="driver-no-image">
                          Proof image unavailable
                        </div>
                      )}

                      {completion.notes && (
                        <p className="driver-saved-notes">
                          <strong>Driver notes:</strong> {completion.notes}
                        </p>
                      )}

                      {completion.completed_at && (
                        <small className="driver-completed-time">
                          Completed:{" "}
                          {new Date(
                            completion.completed_at
                          ).toLocaleString()}
                        </small>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="driver-job-actions">
                  <a
                    className="driver-map-button"
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation size={17} />
                    Get Directions
                  </a>

                  {!completed && !rejected && (
                    <>
                      {job.status !== "In Progress" && (
                        <button
                          type="button"
                          className="driver-start-button"
                          onClick={() => startJob(job)}
                          disabled={busyJob === job.id}
                        >
                          {busyJob === job.id ? (
                            <LoaderCircle
                              className="driver-spin"
                              size={17}
                            />
                          ) : (
                            <Truck size={17} />
                          )}
                          Start Job
                        </button>
                      )}

                      {["Assigned", "In Progress"].includes(job.status) && (
                        <div className="driver-completion-form">
                          <h4>
                            <Camera size={17} />
                            Complete collection
                          </h4>

                          <label className="driver-upload-box">
                            <Upload size={21} />

                            <span>
                              {proofs[job.id]?.name ||
                                "Upload an after-cleanup photo"}
                            </span>

                            <small>JPG, PNG or WebP · Max 10 MB</small>

                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              onChange={(event) => {
                                const file = event.target.files?.[0];

                                if (!file) return;

                                const allowedTypes = [
                                  "image/jpeg",
                                  "image/png",
                                  "image/webp",
                                ];

                                if (!allowedTypes.includes(file.type)) {
                                  setError(
                                    "Please upload a JPG, PNG or WebP image."
                                  );
                                  event.target.value = "";
                                  return;
                                }

                                if (file.size > 10 * 1024 * 1024) {
                                  setError(
                                    "The photo must be 10 MB or smaller."
                                  );
                                  event.target.value = "";
                                  return;
                                }

                                setError("");

                                setProofs((previous) => ({
                                  ...previous,
                                  [job.id]: file,
                                }));
                              }}
                            />
                          </label>

                          {proofs[job.id] && (
                            <img
                              className="driver-proof-preview"
                              src={URL.createObjectURL(proofs[job.id])}
                              alt="Selected completion proof preview"
                            />
                          )}

                          <label className="driver-notes-label">
                            Completion notes (optional)

                            <textarea
                              rows={3}
                              value={notes[job.id] || ""}
                              onChange={(event) =>
                                setNotes((previous) => ({
                                  ...previous,
                                  [job.id]: event.target.value,
                                }))
                              }
                              placeholder="Describe the cleanup or any issues..."
                            />
                          </label>

                          <button
                            type="button"
                            className="driver-complete-button"
                            onClick={() => completeJob(job)}
                            disabled={
                              busyJob === job.id || !proofs[job.id]
                            }
                          >
                            {busyJob === job.id ? (
                              <LoaderCircle
                                className="driver-spin"
                                size={17}
                              />
                            ) : (
                              <CheckCircle2 size={17} />
                            )}
                            Mark Job Completed
                          </button>

                          <p className="driver-proof-hint">
                            The backend must save the proof successfully
                            before it can mark this complaint Resolved.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {completed && (
                    <div className="driver-completed-banner">
                      <CheckCircle2 size={18} />
                      Collection completed
                    </div>
                  )}

                  {rejected && (
                    <div className="driver-completed-banner">
                      This complaint was rejected.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default DriverPortal;