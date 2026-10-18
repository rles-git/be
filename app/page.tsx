
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  BookOpenText,
  Bookmark,
  BookmarkCheck,
  BatteryCharging,
  CarFront,
  Check,
  ChevronRight,
  CircleDot,
  Compass,
  Crosshair,
  History,
  Layers,
  List,
  LocateFixed,
  Map,
  MapPin,
  Navigation,
  PlugZap,
  Route,
  Search,
  Settings2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useStations, type MapStation } from "./hooks/useStations";


function StallChargerIcon({ size = 29 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="3"
        width="16"
        height="26"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect
        x="8"
        y="6"
        width="10"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M15 15L11 20H14L12 24L17 18H14.5L15 15Z"
        fill="currentColor"
      />
      <path
        d="M21 9H24C26 9 27 10.5 27 12.5V19C27 21 25.5 22 24 22"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M23 22L21 20M23 22L21 24"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="leaflet-loading">Loading OpenStreetMap…</div>
  ),
});

type Tab = "Explore" | "Saved" | "Activity" | "Profile";
type Panel = "route" | "chooser" | "station" | "details" | "nearby" | null;

type RecentRoute = {
  id: string;
  stationId: string;
  stationName: string;
  address: string;
  distance: string;
  minutes: number;
  completedAt: string;
};

const START_LOCATION: [number, number] = [
25.254483277668196, 51.47912950286491
];

function getDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function getPowerLabel(station: MapStation) {
  return station.power != null
    ? `${station.power} kW`
    : "Power unavailable";
}

function getAvailabilityLabel(station: MapStation) {
  if (station.available == null || station.plugs == null) {
    return "Availability unavailable";
  }

  return `${station.available} of ${station.plugs} available`;
}

function getPriceLabel(station: MapStation) {
  const price = Number(station.price);

  return station.price != null && Number.isFinite(price)
    ? `QAR ${price.toFixed(2)}/kWh`
    : "Price unavailable";
}

function getStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "online":
      return "Available status reported";
    case "charging":
      return "Charging status reported";
    case "fault":
      return "Fault reported";
    case "offline":
      return "Offline status reported";
    case "maintenance":
      return "Maintenance reported";
    default:
      return "Status unverified";
  }
}

function MapArtwork() {
  return (
    <svg
      className="map-art"
      viewBox="0 0 390 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="390" height="700" fill="#f5f5f2" />
      <path
        d="M278 -20 L390 0 L390 700 L315 700 L354 430 L316 318 L274 240 Z"
        fill="#e6e8e5"
      />
      <path
        d="M250 0 L274 235 L305 278 L350 420 L310 700"
        fill="none"
        stroke="#c8cbc7"
        strokeWidth="7"
      />
      <g stroke="#d6d8d4" strokeWidth="2.7" fill="none">
        <path d="M-30 80 L360 470" />
        <path d="M-20 160 L330 510" />
        <path d="M-30 245 L290 565" />
        <path d="M15 0 L390 375" />
        <path d="M75 -10 L390 305" />
        <path d="M150 -20 L390 220" />
        <path d="M-30 350 L280 40" />
        <path d="M-20 445 L330 95" />
        <path d="M-30 550 L360 160" />
        <path d="M15 660 L390 285" />
        <path d="M95 710 L390 415" />
        <path d="M-10 300 L390 700" />
        <path d="M-10 410 L290 710" />
        <path d="M90 0 L0 95" />
        <path d="M210 0 L0 215" />
      </g>
      <g stroke="#fff" strokeWidth="5" fill="none" opacity=".9">
        <path d="M-20 530 L130 380 L270 240 L390 120" />
        <path d="M20 700 L155 565 L305 415 L390 330" />
      </g>
      <g
        fill="#7e827d"
        fontSize="9"
        fontFamily="Arial, sans-serif"
        letterSpacing=".6"
      >
        <text x="37" y="235">WEST BAY</text>
        <text x="36" y="555">SOMA</text>
        <text x="305" y="620">DOHA, QATAR</text>
      </g>
      <circle cx="98" cy="420" r="23" fill="#e8ece7" opacity=".9" />
      <circle
        cx="98"
        cy="420"
        r="9"
        fill="#91a795"
        stroke="#fff"
        strokeWidth="4"
      />
      <g fill="#a3a6a1" fontSize="9" fontFamily="Arial, sans-serif">
        <text x="52" y="449">Your area</text>
        <text x="20" y="600">Doha</text>
      </g>
    </svg>
  );
}

export default function Home() {
  const { stations, loading, error } = useStations();

  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("Explore");
  const [panel, setPanel] = useState<Panel>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [search, setSearch] = useState("");
  const [fastOnly, setFastOnly] = useState(true);
  const [acOnly, setAcOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [layersOpen, setLayersOpen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetPointerStart = useRef<number | null>(null);

  const [calculatedRoute, setCalculatedRoute] = useState<{
    distance: string;
    minutes: number;
  } | null>(null);

  const [recentRoutes, setRecentRoutes] = useState<RecentRoute[]>([]);

  useEffect(() => {
    if (!stations.length) return;

    if (!stations.some((station) => station.id === selectedId)) {
      setSelectedId(stations[0].id);
    }
  }, [stations, selectedId]);

  function handleSheetPointerDown(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    sheetPointerStart.current = event.clientY;
    setSheetDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSheetPointerMove(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (!sheetDragging || sheetPointerStart.current === null) return;

    const delta = event.clientY - sheetPointerStart.current;
    setSheetDragY(Math.max(-120, Math.min(520, delta)));
  }

  function handleSheetPointerUp() {
    setSheetDragging(false);
    sheetPointerStart.current = null;

    setSheetDragY((current) =>
      current < -45 ? -70 : current > 80 ? 320 : 0
    );
  }

  function handleRouteSheetPointerMove(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (!sheetDragging || sheetPointerStart.current === null) return;

    const delta = event.clientY - sheetPointerStart.current;
    setSheetDragY(Math.max(-120, Math.min(105, delta)));
  }

  function handleRouteSheetPointerUp() {
    setSheetDragging(false);
    sheetPointerStart.current = null;

    setSheetDragY((current) =>
      current < -45 ? -70 : current > 55 ? 65 : 0
    );
  }


  const filtered = useMemo(
    () =>
      stations.filter((station) => {
        const matchesKind =
          (!fastOnly || station.kind === "DC fast") &&
          (!acOnly || station.kind === "AC");

        const matchesAvailability =
          !availableOnly ||
          (station.available != null && station.available >= 2);

        const matchesSearch =
          `${station.name} ${station.address} ${station.id} ${
            station.operator ?? ""
          }`
            .toLowerCase()
            .includes(search.toLowerCase());

        return matchesKind && matchesAvailability && matchesSearch;
      }),
    [stations, search, fastOnly, acOnly, availableOnly]
  );

  const nearbyStations = useMemo(
    () =>
      filtered.filter((station) => {
        const distance = getDistanceKm(
          START_LOCATION[0],
          START_LOCATION[1],
          station.lat,
          station.lng
        );

        return distance <= 5;
      }),
    [filtered]
  );

  const savedStations = stations.filter((station) =>
    saved.includes(station.id)
  );

  const selected = stations.find(
    (station) => station.id === selectedId
  );

  const activeMinutes =
    calculatedRoute?.minutes ?? selected?.minutes ?? 0;

  const activeDistance =
    calculatedRoute?.distance ??
    selected?.distance ??
    "Distance not calculated";

  function notify(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
  }

  function openRoute() {
    setSheetDragY(0);
    setPanel("chooser");
    setRouteMode(false);
  }

  function externalMap(app: string) {
    if (!selected) return;

    const destination = encodeURIComponent(
      `${selected.name}, ${selected.address}`
    );

    const urls: Record<string, string> = {
      "Google Maps": `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
      "Apple Maps": `https://maps.apple.com/?daddr=${destination}`,
      Waze: `https://waze.com/ul?q=${destination}&navigate=yes`,
    };

    if (urls[app]) {
      window.open(urls[app], "_blank", "noopener,noreferrer");
    } else {
      setPanel("route");
      setRouteMode(true);
    }
  }

  function handleConfirmArrival() {
    if (!selected) return;

    const newRoute: RecentRoute = {
      id: `${Date.now()}-${selected.id}`,
      stationId: selected.id,
      stationName: selected.name,
      address: selected.address,
      distance: activeDistance,
      minutes: activeMinutes,
      completedAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setRecentRoutes((previous) => [newRoute, ...previous]);
    setRouteMode(false);
    setPanel(null);
    setSheetDragY(0);
    setCalculatedRoute(null);

    notify(`Arrival recorded at ${selected.shortName}.`);
  }

  if (loading) {
    return (
      <main className="desktop-shell">
        <div className="leaflet-loading">
          Loading charging stations from Neon…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="desktop-shell">
        <div className="leaflet-loading">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (stations.length === 0 || !selected) {
    return (
      <main className="desktop-shell">
        <div className="leaflet-loading">
          No charging stations found. Add station records in Neon and check
          your API endpoint.
        </div>
      </main>
    );
  }

  return (
    <main className="desktop-shell">
      <aside className="desktop-intro">
        <div className="brand-lockup">
          <span className="brand-icon">
            <Zap size={22} />
          </span>
          <span>be-electric</span>
        </div>

        <span className="eyebrow">EV CHARGING, SIMPLIFIED</span>

        <h1>
          Find your charge.
          <br />
          <em>Keep moving.</em>
        </h1>

        <p>
          Explore charging stations, preview routes, and find charging
          locations using data loaded from your station database.
        </p>

        <div className="intro-points">
          <div>
            <span><MapPin size={17} /></span>
            <div>
              <b>Explore stations</b>
              <small>Search charging locations around Qatar.</small>
            </div>
          </div>

          <div>
            <span><Route size={17} /></span>
            <div>
              <b>Preview your route</b>
              <small>See a road route before navigating.</small>
            </div>
          </div>

          <div>
            <span><BatteryCharging size={17} /></span>
            <div>
              <b>Check station details</b>
              <small>View stored power and reported status.</small>
            </div>
          </div>
        </div>

        <div className="desktop-hint">
          <span className="hint-dot" /> Neon database
          <span className="hint-divider">·</span> Station data
        </div>
      </aside>

      <section className="emulator-column">
        <div className="phone-frame">
          <div className="phone-screen">
            <div
              className="map-screen"
              style={{
                display: activeTab === "Explore" ? "block" : "none",
              }}
            >
              <LeafletMap
                stations={filtered}
                selectedId={selectedId}
                routeMode={routeMode}
                onSelect={(id: string) => {
                  setSelectedId(id);
                  setPanel("station");
                  setRouteMode(false);
                  setSheetDragY(0);
                  setCalculatedRoute(null);
                }}
                onRouteCalculated={(metrics) =>
                  setCalculatedRoute(metrics)
                }
              />

              {panel !== "route" && panel !== "details" && (
                <div className="search-wrap">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search city, landmark, or charger ID"
                    aria-label="Search chargers"
                  />
                  {search && (
                    <button onClick={() => setSearch("")}>
                      <X size={15} />
                    </button>
                  )}
                </div>
              )}

              {panel !== "route" && panel !== "details" && (
                <div className="filter-row">
                  <button
                    className={`filter-chip ${acOnly ? "active" : ""}`}
                    onClick={() => {
                      setAcOnly(!acOnly);
                      if (!acOnly) setFastOnly(false);
                    }}
                  >
                    AC Charging
                  </button>

                  <button
                    className={`filter-chip ${fastOnly ? "active" : ""}`}
                    onClick={() => {
                      setFastOnly(!fastOnly);
                      if (!fastOnly) setAcOnly(false);
                    }}
                  >
                    {fastOnly && <Check size={13} />}
                    DC Fast Charger
                  </button>

                  <button
                    className={`filter-chip ${
                      availableOnly ? "active" : ""
                    }`}
                    onClick={() => setAvailableOnly(!availableOnly)}
                  >
                    2+ Plugs Available
                  </button>
                </div>
              )}

              {panel === "route" && (
                <div className="route-top-card">
                  <button
                    className="cancel-route-button"
                    onClick={() => {
                      setRouteMode(false);
                      setCalculatedRoute(null);
                      setSheetDragY(0);
                      setPanel("station");
                      notify("Navigation cancelled.");
                    }}
                    aria-label="Cancel navigation"
                    title="Cancel navigation"
                  >
                    <X size={18} />
                  </button>

                  <div>
                    <span className="route-origin-dot" />
                    <span>Your location · Doha, Qatar</span>
                  </div>

                  <div>
                    <Zap size={16} />
                    <b>{selected.name}</b>
                  </div>
                </div>
              )}

              {panel === "route" && routeMode && (
                <>
                  <div className="route-pill">{activeMinutes} min</div>
                  <div className="route-destination-label">
                    {selected.shortName}
                  </div>
                </>
              )}

              <div
                className="map-tools"
                style={{
                  bottom:
                    panel === "route"
                      ? "calc(var(--route-sheet-height, 300px) + 64px)"
                      : panel === "details"
                        ? "240px"
                        : `calc(240px + ${Math.max(0, -sheetDragY)}px)`,
                }}
              >
                <button
                  className="tool-button"
                  onClick={() => setLayersOpen(!layersOpen)}
                  aria-label="Map layers"
                >
                  <Layers size={19} />
                </button>

                <button
                  className="tool-button"
                  onClick={() => {
                    window.dispatchEvent(new Event("be-electric-locate"));
                    notify("Map centered on the starting location.");
                  }}
                  aria-label="Locate starting point"
                >
                  <Crosshair size={19} />
                </button>

                {layersOpen && (
                  <div className="layers-popover">
                    <b>Map layers</b>
                    <button
                      onClick={() => {
                        setLayersOpen(false);
                        notify("Standard map selected.");
                      }}
                    >
                      Standard <Check size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setLayersOpen(false);
                        notify("Charging overlay selected.");
                      }}
                    >
                      Charging overlay
                    </button>
                  </div>
                )}
              </div>

              {panel === "route" ? (
                <div
                  className={`route-bottom-sheet ${
                    sheetDragging ? "sheet-dragging" : ""
                  }`}
                  style={{
                    transform: `translateY(clamp(0px, ${sheetDragY}px, 105px))`,
                    transition: sheetDragging
                      ? "none"
                      : "transform 180ms ease-out",
                  }}
                >
                  <div
                    className="sheet-grabber sheet-drag-handle"
                    onPointerDown={handleSheetPointerDown}
                    onPointerMove={handleRouteSheetPointerMove}
                    onPointerUp={handleRouteSheetPointerUp}
                    onPointerCancel={handleRouteSheetPointerUp}
                    role="separator"
                    aria-label="Drag route details panel"
                  />

                  <div className="route-time">
                    <strong>{activeMinutes} min</strong>
                    <span>{activeDistance}</span>
                    <small><CarFront size={13} /> Drive</small>
                  </div>

                  <h3>{selected.name}</h3>

                  <div className="route-availability">
                    <span>{getAvailabilityLabel(selected)}</span>
                    <small>
                      {getPowerLabel(selected)} · {getPriceLabel(selected)}
                    </small>
                  </div>

                  <button
                    className="primary-button"
                    onClick={handleConfirmArrival}
                  >
                    <Check size={18} /> Confirm Arrival
                  </button>

                  <button
                    className="sheet-back-link"
                    onClick={() => {
                      setSheetDragY(0);
                      setPanel("chooser");
                      setRouteMode(false);
                    }}
                  >
                    Choose Another Service
                  </button>
                </div>
              ) : panel === "nearby" ? (
                <div
                  className="sheet-overlay"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "flex-end",
                    background: "rgba(20, 25, 21, 0.18)",
                  }}
                  onClick={() => setPanel(null)}
                >
                  <section
                    className={`station-sheet nearby-stations-sheet ${
                      sheetDragging ? "sheet-dragging" : ""
                    }`}
                    aria-label="Nearby charging stations"
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      transform: `translateY(${Math.min(
                        Math.max(sheetDragY, 0),
                        350
                      )}px)`,
                      transition: sheetDragging
                        ? "none"
                        : "transform 180ms ease-out",
                    }}
                  >
                    <div
                      className="sheet-grabber sheet-drag-handle"
                      onPointerDown={handleSheetPointerDown}
                      onPointerMove={handleSheetPointerMove}
                      onPointerUp={handleSheetPointerUp}
                      onPointerCancel={handleSheetPointerUp}
                      role="separator"
                      aria-label="Drag nearby stations panel"
                    />
                    <div className="sheet-title-row">
                      <div>
                        <h2>Nearby stations</h2>
                        <p>{nearbyStations.length} stations within 5 km</p>
                      </div>
                      <button
                        className="sheet-close"
                        aria-label="Close nearby stations"
                        onClick={() => setPanel(null)}
                      >
                        <X size={17} />
                      </button>
                    </div>
                    {nearbyStations.length === 0 ? (
                      <div className="empty-state">
                        <MapPin size={24} />
                        <b>No nearby stations match these filters</b>
                        <p>Try changing the charger filters or search.</p>
                      </div>
                    ) : nearbyStations.map((station) => (
                      <button
                        key={station.id}
                        className="saved-card nearby-station-row"
                        style={{
                          width: "100%",
                          display: "flex",
                          textAlign: "left",
                          alignItems: "center",
                          gap: 12,
                          padding: "14px 0",
                          border: 0,
                          borderBottom: "1px solid #edf0ec",
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setSelectedId(station.id);
                          setRouteMode(false);
                          setCalculatedRoute(null);
                          setSheetDragY(0);
                          setPanel("station");
                          window.dispatchEvent(new CustomEvent(
                            "be-electric-pan-to-station",
                            { detail: { lat: station.lat, lng: station.lng } }
                          ));
                        }}
                      >
                        <span className="saved-zap">
                          <Zap size={19} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b style={{ display: "block" }}>{station.name}</b>
                          <small style={{ display: "block", marginTop: 3 }}>
                            {station.address}
                          </small>
                          <small style={{ display: "block", marginTop: 5 }}>
                            {getAvailabilityLabel(station)} · {getPowerLabel(station)}
                          </small>
                        </span>
                        <span style={{ textAlign: "right", flexShrink: 0 }}>
                          <b>{getDistanceKm(
                            START_LOCATION[0],
                            START_LOCATION[1],
                            station.lat,
                            station.lng
                          ).toFixed(1)} km</b>
                          <small style={{ display: "block", marginTop: 4 }}>
                            {station.status}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </section>
                </div>
              ) : panel === "chooser" ? (
                <div className="sheet-overlay">
                  <div
                    className={`bottom-sheet chooser-sheet ${
                      sheetDragging ? "sheet-dragging" : ""
                    }`}
                    style={{
                      transform: `translateY(clamp(0px, ${sheetDragY}px, 360px))`,
                      transition: sheetDragging
                        ? "none"
                        : "transform 180ms ease-out",
                    }}
                  >
                    <div
                      className="sheet-grabber sheet-drag-handle"
                      onPointerDown={handleSheetPointerDown}
                      onPointerMove={handleSheetPointerMove}
                      onPointerUp={handleSheetPointerUp}
                      onPointerCancel={handleSheetPointerUp}
                      role="separator"
                      aria-label="Drag route chooser panel"
                    />

                    <div className="sheet-title-row">
                      <div>
                        <h2>Choose your route</h2>
                        <p>
                          {selected.shortName} · {activeDistance} ·{" "}
                          {activeMinutes} min
                        </p>
                      </div>
                      <button
                        className="sheet-close"
                        onClick={() => setPanel("station")}
                      >
                        <X size={17} />
                      </button>
                    </div>

                    {[
                      {
                        name: "Google Maps",
                        desc: "Traffic-aware directions",
                        icon: <MapPin size={19} />,
                      },
                      {
                        name: "Apple Maps",
                        desc: "Navigate with your iPhone",
                        icon: <Map size={19} />,
                      },
                      {
                        name: "Waze",
                        desc: "Community-powered traffic",
                        icon: <CarFront size={19} />,
                      },
                      {
                        name: "In-App Route Preview",
                        desc: "Preview the route in Be-Electric",
                        icon: <Route size={19} />,
                      },
                    ].map((item) => (
                      <button
                        key={item.name}
                        className={`route-option ${
                          item.name === "In-App Route Preview"
                            ? "chosen"
                            : ""
                        }`}
                        onClick={() => externalMap(item.name)}
                      >
                        <span className="route-option-icon">{item.icon}</span>
                        <span className="route-option-copy">
                          <b>{item.name}</b>
                          <small>{item.desc}</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))}

                    <p className="chooser-footnote">
                      Your selected station stays selected when you return.
                    </p>
                  </div>
                </div>
              ) : panel === "details" ? (
                <div className="station-details-screen">
                  <header className="details-header">
                    <button
                      className="details-back"
                      onClick={() => setPanel("station")}
                      aria-label="Back to station"
                    >
                      <ChevronRight
                        size={21}
                        style={{ transform: "rotate(180deg)" }}
                      />
                    </button>
                    <div>
                      <small>STATION INFORMATION</small>
                      <h2>{selected.shortName}</h2>
                    </div>
                    <span className="details-live-dot" />
                  </header>

                  <div className="details-scroll">
                    <div className="details-location-card">
                      <div className="details-location-icon">
                        <Zap size={25} />
                      </div>
                      <div>
                        <span className="details-eyebrow">
                          BE-ELECTRIC NETWORK
                        </span>
                        <h3>{selected.name}</h3>
                        <p>{selected.address}</p>
                      </div>
                      <span className="details-open-badge">
                        {selected.status}
                      </span>
                    </div>

                    <section className="details-section">
                      <div className="details-section-heading">
                        <h3>Charging overview</h3>
                        <span>DATABASE DATA</span>
                      </div>
                      <div className="details-stats">
                        <div>
                          <Zap size={18} />
                          <small>Max power</small>
                          <strong>{getPowerLabel(selected)}</strong>
                        </div>
                        <div>
                          <PlugZap size={18} />
                          <small>Available</small>
                          <strong>{getAvailabilityLabel(selected)}</strong>
                        </div>
                        <div>
                          <Activity size={18} />
                          <small>Energy price</small>
                          <strong>{getPriceLabel(selected)}</strong>
                        </div>
                      </div>
                      <p className="details-note">
                        {getStatusLabel(selected.status)}. A database status
                        is not necessarily a live charger status.
                      </p>
                    </section>
          
                  
                    <section className="details-section">
                                         
                    <div className="details-section">
                      <div className="details-section-heading">
                        <h3>Available stalls</h3>
                        <span>LIVE DEMO</span>
                      </div>
                    
                      <div className="stall-availability-summary">
                        <div>
                          <strong>3 of 4 available</strong>
                          <p>CCS2 · DC fast charging</p>
                        </div>
                    
                        <span className="stall-availability-badge">
                          <span className="stall-status-dot" />
                          Available
                        </span>
                      </div>
                    
                      <div className="stall-grid">
                        {[
                          { id: 1, status: "Available", power: 0 },
                          { id: 2, status: "Available", power: 0 },
                          { id: 3, status: "Occupied", power: 30 },
                          { id: 4, status: "Available", power: 0 },
                        ].map((stall) => (
                          <button
                            key={stall.id}
                            type="button"
                            className={`stall-option ${
                              stall.status === "Available"
                                ? "stall-available"
                                : "stall-occupied"
                            }`}
                            onClick={() =>
                              notify(
                                `Stall ${stall.id}: ${stall.status} · ${stall.power} kW`
                              )
                            }
                            aria-label={`Stall ${stall.id}: ${stall.status}, ${stall.power} kW`}
                          >
                            <span className="stall-number">
                              Stall {stall.id}
                            </span>
                    
                            <span className="stall-charger-icon">
                              <StallChargerIcon size={29} />
                            </span>
                    
                            <strong>{stall.status}</strong>
                    
                            <span className="stall-power-output">
                              {stall.power} <small>kW</small>
                            </span>
                    
                            <small>CCS2</small>
                          </button>
                        ))}
                      </div>
                    
                      <p className="details-note">
                        Demonstration data only. Stall availability and power output
                        are simulated and are not connected to live charger telemetry.
                      </p>
                    </div>
                    </section>



                    <section className="details-section">
                      <h3>Wayfinding instructions</h3>
                      <div className="wayfinding-list">
                        <div>
                          <span>1</span>
                          <div>
                            <strong>Navigate to the location</strong>
                            <p>Follow the route to {selected.shortName}.</p>
                          </div>
                        </div>
                        <div>
                          <span>2</span>
                          <div>
                            <strong>Find the charging area</strong>
                            <p>
                              Follow on-site parking and EV charging signs
                              to locate the charging bays.
                            </p>
                          </div>
                        </div>
                        <div>
                          <span>3</span>
                          <div>
                            <strong>Verify the charger</strong>
                            <p>
                              Check the charger display and connector
                              before connecting your vehicle.
                            </p>
                          </div>
                        </div>
                      </div>
                      <button className="primary-button" onClick={openRoute}>
                        <Navigation size={18} /> Get Directions
                      </button>
                    </section>

                    <section className="details-section">
                      <h3>Station record</h3>
                      <div className="operating-card">
                        <span className="operating-icon">
                          <History size={20} />
                        </span>
                        <div>
                          <strong>{selected.id}</strong>
                          <p>{selected.address}</p>
                          <small>
                            {selected.operator
                              ? `Operator: ${selected.operator}`
                              : "Operator not specified"}
                          </small>
                        </div>
                      </div>
                    </section>

                    <section className="details-section">
                      <div className="details-section-heading">
                        <h3>User check-ins</h3>
                        <span>COMMUNITY</span>
                      </div>
                      <div className="community-card">
                        <div className="community-avatar">EV</div>
                        <div>
                          <strong>Driver check-in</strong>
                          <small>Community feature preview</small>
                          <p>
                            Check the bay markings and connector before
                            charging.
                          </p>
                        </div>
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          notify("Community check-ins are not connected yet.")
                        }
                      >
                        <Check size={18} /> Check in at this station
                      </button>
                    </section>
                    <div className="details-bottom-space" />
                  </div>
                </div>
              ) : panel === "station" ? (
                <div
                  className={`station-sheet ${
                    sheetDragging ? "sheet-dragging" : ""
                  }`}
                  style={{
                    transform: `translateY(${Math.min(
                      Math.max(sheetDragY, 0),
                      350
                    )}px)`,
                    transition: sheetDragging
                      ? "none"
                      : "transform 180ms ease-out",
                  }}
                >
                  <div
                    className="sheet-grabber sheet-drag-handle"
                    onPointerDown={handleSheetPointerDown}
                    onPointerMove={handleSheetPointerMove}
                    onPointerUp={handleSheetPointerUp}
                    onPointerCancel={handleSheetPointerUp}
                    role="separator"
                    aria-label="Drag station details panel"
                  />

                  <div className="sheet-overline">BE-ELECTRIC NETWORK</div>

                  <div className="station-title-row">
                    <h2>{selected.name}</h2>
                    <button
                      className={`save-button ${
                        saved.includes(selected.id) ? "saved" : ""
                      }`}
                      onClick={() =>
                        setSaved((previous) =>
                          previous.includes(selected.id)
                            ? previous.filter((id) => id !== selected.id)
                            : [...previous, selected.id]
                        )
                      }
                      aria-label="Save station"
                    >
                      {saved.includes(selected.id) ? (
                        <BookmarkCheck size={19} />
                      ) : (
                        <Bookmark size={19} />
                      )}
                    </button>
                  </div>

                  <p className="station-address">{selected.address}</p>

                  <div className="station-summary">
                    <span>{getAvailabilityLabel(selected)}</span>
                    <small>
                      {selected.distance || "Distance not calculated"}
                    </small>
                  </div>

                  <div className="spec-grid">
                    <div>
                      <small>MAX POWER</small>
                      <b>{getPowerLabel(selected)}</b>
                      <span>{selected.kind}</span>
                    </div>
                    <div>
                      <small>ENERGY PRICE</small>
                      <b>{getPriceLabel(selected)}</b>
                      <span>{getStatusLabel(selected.status)}</span>
                    </div>
                  </div>

                  <button className="primary-button" onClick={openRoute}>
                    <Navigation size={18} /> Get Directions
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() => {
                      setSheetDragY(0);
                      setPanel("details");
                    }}
                  >
                    <BookOpenText size={18} /> More Details
                  </button>

                  <button
                    className="sheet-back-link"
                    onClick={() => {
                      setPanel(null);
                      setRouteMode(false);
                      setSheetDragY(0);
                    }}
                  >
                    Back to map
                  </button>
                </div>
              ) : (
                <div className="map-bottom-content">
                  <div className="legend">
                    <span><i className="green-dot" /> Online</span>
                    <span><i className="gray-dot" /> Unknown</span>
                    <span><i className="gray-dot" /> Offline</span>
                  </div>

                  <button
                    className="nearby-card"
                    onClick={() => {
                      setSheetDragY(0);
                      setPanel("nearby");
                    }}
                  >
                    <span className="nearby-icon">
                      <LocateFixed size={19} />
                    </span>
                    <span>
                      <b>{nearbyStations.length} stations nearby</b>
                      <small>Based on stored station coordinates</small>
                    </span>
                    <List size={19} />
                  </button>
                </div>
              )}
            </div>

            {activeTab !== "Explore" && (
              <div className="other-tab-screen">
                {activeTab === "Saved" && (
                  <>
                    <h2>Saved stations</h2>
                    <p className="tab-subtitle">
                      Your favorite charging spots, all in one place.
                    </p>

                    {savedStations.length ? (
                      savedStations.map((station) => (
                        <button
                          className="saved-card"
                          key={station.id}
                          onClick={() => {
                            setSelectedId(station.id);
                            setActiveTab("Explore");
                            setPanel("station");
                          }}
                        >
                          <span className="saved-zap">
                            <Zap size={19} />
                          </span>
                          <span>
                            <b>{station.name}</b>
                            <small>
                              {getAvailabilityLabel(station)}
                            </small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))
                    ) : (
                      <div className="empty-state">
                        <span><Bookmark size={26} /></span>
                        <b>No saved stations yet</b>
                        <p>
                          Open a station and tap the bookmark to keep it here.
                        </p>
                        <button onClick={() => setActiveTab("Explore")}>
                          Explore stations
                        </button>
                      </div>
                    )}
                  </>
                )}

                {activeTab === "Activity" && (
                  <>
                    <h2>Your activity</h2>
                    <p className="tab-subtitle">
                      A quick look at your charging journey.
                    </p>

                    <div className="recent-routes-section">
                      <div className="activity-card header-card">
                        <span><History size={20} /></span>
                        <div>
                          <b>Recent routes ({recentRoutes.length})</b>
                          <small>
                            {recentRoutes.length
                              ? "Recently completed trips"
                              : "No recent routes in this session."}
                          </small>
                        </div>
                      </div>

                      {recentRoutes.slice(0, 3).map((route) => (
                        <button
                          key={route.id}
                          className="saved-card"
                          onClick={() => {
                            setSelectedId(route.stationId);
                            setActiveTab("Explore");
                            setPanel("station");
                          }}
                        >
                          <span className="saved-zap">
                            <Route size={18} />
                          </span>
                          <span>
                            <b>{route.stationName}</b>
                            <small>
                              {route.distance} · {route.minutes} min ·{" "}
                              {route.completedAt}
                            </small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </div>

                    <div className="activity-card" style={{ marginTop: 12 }}>
                      <span><PlugZap size={20} /></span>
                      <div>
                        <b>Charging sessions</b>
                        <small>
                          Charging sessions are not connected to Neon yet.
                        </small>
                      </div>
                    </div>

                    <div className="stat-cards">
                      <div>
                        <b>{saved.length}</b>
                        <small>Saved stations</small>
                      </div>
                      <div>
                        <b>{recentRoutes.length}</b>
                        <small>Completed trips</small>
                      </div>
                      <div>
                        <b>{nearbyStations.length}</b>
                        <small>Nearby stations</small>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === "Profile" && (
                  <>
                    <h2>Your profile</h2>
                    <p className="tab-subtitle">
                      Manage your Be-Electric preferences.
                    </p>

                    <div className="profile-card">
                      <div className="avatar">
                        <UserRound size={25} />
                      </div>
                      <div>
                        <b>Guest driver</b>
                        <small>Demo account</small>
                      </div>
                      <span className="demo-tag">DEMO</span>
                    </div>

                    {[
                      "Account details",
                      "Notifications",
                      "Charging preferences",
                      "Privacy & security",
                    ].map((item, index) => (
                      <button
                        key={item}
                        className="settings-row"
                        onClick={() => notify(`${item} is a demo setting.`)}
                      >
                        <span>
                          {[
                            <UserRound key="account" size={18} />,
                            <Activity key="notifications" size={18} />,
                            <Settings2 key="preferences" size={18} />,
                            <CircleDot key="privacy" size={18} />,
                          ][index]}
                        </span>
                        {item}
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </>
                )}

                <div className="tab-map-mini">
                  <MapArtwork />
                  <button onClick={() => setActiveTab("Explore")}>
                    <Compass size={16} /> Back to Explore
                  </button>
                </div>
              </div>
            )}

            <nav className="bottom-nav">
              {(
                [
                  { name: "Explore", icon: <Map size={19} /> },
                  { name: "Saved", icon: <Bookmark size={19} /> },
                  { name: "Activity", icon: <Activity size={19} /> },
                  { name: "Profile", icon: <UserRound size={19} /> },
                ] as { name: Tab; icon: React.ReactNode }[]
              ).map((item) => (
                <button
                  key={item.name}
                  className={activeTab === item.name ? "active" : ""}
                  onClick={() => {
                    setActiveTab(item.name);

                    if (item.name === "Explore") {
                      window.dispatchEvent(
                        new Event("be-electric-map-visible")
                      );
                    }
                  }}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </button>
              ))}
            </nav>

            {message && <div className="toast">{message}</div>}
          </div>
        </div>

        <div className="emulator-footer">
          <span>
            <span className="footer-dot" /> Connected to station database
          </span>

          <button
            onClick={() => {
              setActiveTab("Explore");
              setPanel(null);
              setRouteMode(false);
              setSearch("");
              setFastOnly(true);
              setAcOnly(false);
              setAvailableOnly(false);
              setRecentRoutes([]);
              setCalculatedRoute(null);
              setSheetDragY(0);
              setSaved([]);
            }}
          >
            Reset demo <History size={13} />
          </button>
        </div>
      </section>
    </main>
  );
}
