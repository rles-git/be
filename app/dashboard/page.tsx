
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
import { useStations, type MapStation } from "../hooks/useStations";

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
      <rect x="5" y="3" width="16" height="26" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <rect x="8" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 15L11 20H14L12 24L17 18H14.5L15 15Z" fill="currentColor" />
      <path d="M21 9H24C26 9 27 10.5 27 12.5V19C27 21 25.5 22 24 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M23 22L21 20M23 22L21 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LeafletMap = dynamic(() => import("../LeafletMap"), {
  ssr: false,
  loading: () => <div className="leaflet-loading">Loading OpenStreetMap…</div>,
});

type Tab = "Explore" | "Saved" | "Activity" | "Profile";

type Panel =
  | "route"
  | "chooser"
  | "station"
  | "details"
  | "nearby"
  | "connector"
  | "charging"
  | "charging-review"
  | null;

type RecentRoute = {
  id: string;
  stationId: string;
  stationName: string;
  address: string;
  distance: string;
  minutes: number;
  completedAt: string;
};

type DbConnector = {
  id: string | number;
  charger_id: string | number;
  connector_number: number;
  connector_type: string;
  max_power_kw: number | string | null;
  status: string;
};

type DbCharger = {
  id: string | number;
  station_id: string | number;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  max_power_kw: number | string | null;
  status: string;
  protocol: string | null;
  protocol_identity: string | null;
  connectors: DbConnector[];
};

type ChargerDisplay = {
  id: number;
  chargerId: string;
  status: string;
  power: number;
  connectors: DbConnector[];
};

type StationWithChargers = MapStation & {
  chargers?: DbCharger[];
};

function isAvailableStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  return ["available", "online", "idle", "ready"].includes(normalized);
}

const START_LOCATION: [number, number] = [
25.254483277668196,51.47912950286491,
];

const CHARGING_TARGETS = [20, 30, 40, 50, 60, 70, 80, 90];

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

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPowerLabel(station: MapStation) {
  return station.power != null ? `${station.power} kW` : "Power unavailable";
}

function getAvailabilityLabel(station: MapStation) {
  const stationWithChargers = station as StationWithChargers;

  const chargers = Array.isArray(stationWithChargers.chargers)
    ? stationWithChargers.chargers
    : [];

  const total = chargers.length;

  const available = chargers.filter((charger) =>
    isAvailableStatus(charger.status)
  ).length;

  if (total === 0) {
    return "No chargers available";
  }

  return `${available} of ${total} chargers available`;
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
      <path d="M278 -20 L390 0 L390 700 L315 700 L354 430 L316 318 L274 240 Z" fill="#e6e8e5" />
      <path d="M250 0 L274 235 L305 278 L350 420 L310 700" fill="none" stroke="#c8cbc7" strokeWidth="7" />
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
      <g fill="#7e827d" fontSize="9" fontFamily="Arial, sans-serif" letterSpacing=".6">
        <text x="37" y="235">WEST BAY</text>
        <text x="36" y="555">SOMA</text>
        <text x="305" y="620">DOHA, QATAR</text>
      </g>
      <circle cx="98" cy="420" r="23" fill="#e8ece7" opacity=".9" />
      <circle cx="98" cy="420" r="9" fill="#91a795" stroke="#fff" strokeWidth="4" />
      <g fill="#a3a6a1" fontSize="9" fontFamily="Arial, sans-serif">
        <text x="52" y="449">Your area</text>
        <text x="20" y="600">Doha</text>
      </g>
    </svg>
  );
}

type UserProfile = {
  id?: string;
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  createdAt?: string | null;
};

export default function Home() {
  const { stations, loading, error } = useStations();

  const [selectedId, setSelectedId] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Explore");
  const [panel, setPanel] = useState<Panel>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [search, setSearch] = useState("");
  const [fastOnly, setFastOnly] = useState(true);
  const [acOnly, setAcOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savingStationId, setSavingStationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [layersOpen, setLayersOpen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [selectedStall, setSelectedStall] = useState<number | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<DbConnector | null>(null);

  // Charging setup state
  const [chargeTarget, setChargeTarget] = useState("80");
  const [customTarget, setCustomTarget] = useState("");
  const [carConnected, setCarConnected] = useState(false);
  const [handshakePending, setHandshakePending] = useState(false);
  const [handshakeError, setHandshakeError] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
async function handleCableConnection() {
  if (handshakePending || carConnected) return;

  setHandshakePending(true);
  setHandshakeError("");

  try {
    // Connect to your mock simulator.
    const socket = new WebSocket(
      process.env.NEXT_PUBLIC_SIMULATOR_WS_URL ||
        "wss://be-electric-simulator.onrender.com/ws"
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error("Charger handshake timed out."));
      }, 15000);

      socket.onopen = () => {
        // IMPORTANT:
        // Send the handshake request expected by your simulator here.
        // The exact message format must match its server implementation.
        socket.send(
          JSON.stringify({
            type: "RUN_HANDSHAKE",
            chargerId: String(
              stalls.find((item) => item.id === selectedStall)?.chargerId ?? ""
            ),
            connectorId: selectedConnector?.id,
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Only accept an explicit successful handshake response.
          if (
            data.type === "handshakeResult" &&
            data.ok === true
          ) {
            window.clearTimeout(timeout);
            socket.close();
            resolve();
          } else if (
            data.type === "handshakeResult" &&
            data.ok === false
          ) {
            window.clearTimeout(timeout);
            socket.close();
            reject(
              new Error(data.message || "The charger handshake failed.")
            );
          }
        } catch {
          // Ignore unrelated or non-JSON telemetry messages.
        }
      };

      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Could not connect to the mock charger simulator."));
      };

      socket.onclose = () => {
        // A connection closing without a successful handshake
        // must not be treated as a successful connection.
      };
    });

    setCarConnected(true);
  } catch (error) {
    setCarConnected(false);
    setHandshakeError(
      error instanceof Error
        ? error.message
        : "The charger handshake failed. Please try again."
    );
  } finally {
    setHandshakePending(false);
  }
}
  
useEffect(() => {
  if (activeTab !== "Profile") return;

  let cancelled = false;

  async function loadProfile() {
    try {
      setProfileLoading(true);
      setProfileError("");

      const response = await fetch("/api/stations/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to load your account details."
        );
      }

      const profile = data.user ?? data.profile ?? data;

      if (!cancelled) {
        setUserProfile({
          id: profile.id,
          fullName:
            profile.fullName ??
            profile.full_name ??
            profile.name ??
            "",
          email: profile.email ?? "",
          phone: profile.phone ?? profile.phone_number ?? null,
          createdAt:
            profile.createdAt ??
            profile.created_at ??
            null,
        });
      }
    } catch (error) {
      if (!cancelled) {
        setProfileError(
          error instanceof Error
            ? error.message
            : "Unable to load your account details."
        );
      }
    } finally {
      if (!cancelled) {
        setProfileLoading(false);
      }
    }
  }

  loadProfile();

  return () => {
    cancelled = true;
  };
}, [activeTab]);


useEffect(() => {
  let cancelled = false;

  async function loadSavedStations() {
    try {
      setSavedLoading(true);

      const response = await fetch("/api/saved-stations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401) {
        if (!cancelled) setSaved([]);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load saved stations.");
      }

      if (!cancelled) {
        setSaved(
          (data.savedStations ?? []).map(
            (item: { station_id: string | number }) =>
              String(item.station_id)
          )
        );
      }
    } catch (error) {
      console.error("Load saved stations error:", error);
    } finally {
      if (!cancelled) setSavedLoading(false);
    }
  }

  void loadSavedStations();

  return () => {
    cancelled = true;
  };
}, []);

  
async function toggleSavedStation(stationId: string | number) {
  const id = String(stationId);

  if (savingStationId !== null) return;

  const isSaved = saved.includes(id);

  try {
    setSavingStationId(id);

    const response = await fetch(
      isSaved
        ? `/api/saved-stations/${encodeURIComponent(id)}`
        : "/api/saved-stations",
      {
        method: isSaved ? "DELETE" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...(!isSaved
          ? { body: JSON.stringify({ station_id: id }) }
          : {}),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to update saved stations.");
    }

    setSaved((previous) =>
      isSaved
        ? previous.filter((savedId) => savedId !== id)
        : previous.includes(id)
          ? previous
          : [...previous, id]
    );
  } catch (error) {
    console.error("Toggle saved station error:", error);

    setMessage(
      error instanceof Error
        ? error.message
        : "Unable to update saved stations."
    );
  } finally {
    setSavingStationId(null);
  }
}

  
  
  const sheetPointerStart = useRef<number | null>(null);


const selectedStationForChargers = stations.find(
  (station) => String(station.id) === String(selectedId)
) as StationWithChargers | undefined;

const databaseChargers = Array.isArray(
  selectedStationForChargers?.chargers
)
  ? selectedStationForChargers.chargers
  : [];

const stalls: ChargerDisplay[] = databaseChargers.map(
  (charger, index) => ({
    id: index + 1,
    chargerId: String(charger.id),
    status: String(charger.status ?? "Unknown"),
    power: Number(charger.max_power_kw) || 0,
    connectors: Array.isArray(charger.connectors)
      ? charger.connectors
      : [],
  })
);


  
const availableStalls = stalls.filter((charger) =>
  isAvailableStatus(charger.status)
);

const columns = Math.max(1, Math.ceil(Math.sqrt(availableStalls.length)));


  const effectiveChargeTarget =
    chargeTarget === "Custom" ? Number(customTarget) : Number(chargeTarget);

  const validChargeTarget =
    Number.isFinite(effectiveChargeTarget) &&
    effectiveChargeTarget >= 10 &&
    effectiveChargeTarget <= 100 &&
    Number.isInteger(effectiveChargeTarget);

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

  function handleSheetPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    sheetPointerStart.current = event.clientY;
    setSheetDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSheetPointerMove(event: React.PointerEvent<HTMLDivElement>) {
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


  const searchSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return [];

    return stations
      .map((station) => {
        const name = String(station.name ?? "");
        const address = String(station.address ?? "");
        const id = String(station.id ?? "");
        const operator = String(station.operator ?? "");

        const nameLower = name.toLowerCase();
        const addressLower = address.toLowerCase();
        const idLower = id.toLowerCase();
        const operatorLower = operator.toLowerCase();

        let score = 99;

        if (idLower === query || nameLower === query) {
          score = 0;
        } else if (
          idLower.startsWith(query) ||
          nameLower.startsWith(query)
        ) {
          score = 1;
        } else if (nameLower.includes(query)) {
          score = 2;
        } else if (addressLower.includes(query)) {
          score = 3;
        } else if (operatorLower.includes(query)) {
          score = 4;
        } else if (idLower.includes(query)) {
          score = 5;
        }

        return { station, score };
      })
      .filter((item) => item.score < 99)
      .sort(
        (a, b) =>
          a.score - b.score ||
          String(a.station.name).localeCompare(
            String(b.station.name)
          )
      )
      .slice(0, 5)
      .map((item) => item.station);
  }, [stations, search]);

  
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

  const selected = stations.find((station) => station.id === selectedId);

  const activeMinutes = calculatedRoute?.minutes ?? selected?.minutes ?? 0;
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

  function openStall(stallId: number, status: string) {
    if (!isAvailableStatus(status)) {
      notify(`Charger ${stalls.find((item) => item.id === stallId)?.chargerId ?? stallId} is not available.`);
      return;
    }

    setSelectedStall(stallId);
    setSelectedConnector(null);
    setPanel("connector");
    setSheetDragY(0);
  }

  function selectConnector(connector: DbConnector) {
    if (selectedStall === null) return;

    if (!isAvailableStatus(connector.status)) {
      notify(`Connector ${connector.connector_number} is not available.`);
      return;
    }

    setSelectedConnector(connector);
    setChargeTarget("80");
    setCustomTarget("");
    setCarConnected(false);
    setPanel("charging");
    setSheetDragY(0);
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
          <button onClick={() => window.location.reload()}>Try again</button>
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
                onRouteCalculated={(metrics) => setCalculatedRoute(metrics)}
              />

              {![
                "route",
                "details",
                "connector",
                "charging",
                "charging-review",
              ].includes(panel ?? "") && (
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
                              
                  {search.trim() !== "" && searchSuggestions.length > 0 && (
                    <div className="search-suggestions">
                      {searchSuggestions.map((station) => (
                        <button
                          key={station.id}
                          type="button"
                          className="search-suggestion"
                          onClick={() => {
                            setSelectedId(String(station.id));
                            setActiveTab("Explore");
                            setPanel("station");
                            setRouteMode(false);
                            setCalculatedRoute(null);
                            setSheetDragY(0);
                            setSearch("");
                
                            window.dispatchEvent(
                              new CustomEvent("be-electric-pan-to-station", {
                                detail: {
                                  lat: Number(station.lat),
                                  lng: Number(station.lng),
                                },
                              })
                            );
                          }}
                        >
                          <span className="search-suggestion-icon">
                            <MapPin size={17} />
                          </span>
                
                          <span className="search-suggestion-text">
                            <strong>{station.name}</strong>
                            <small>
                              {station.address || station.id}
                            </small>
                          </span>
                
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  )}

              {![
                "route",
                "details",
                "connector",
                "charging",
                "charging-review",
              ].includes(panel ?? "") && (
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
                    className={`filter-chip ${availableOnly ? "active" : ""}`}
                    onClick={() => setAvailableOnly(!availableOnly)}
                  >
                    2+ chargers Available
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
                      : [
                            "details",
                            "connector",
                            "charging",
                            "charging-review",
                          ].includes(panel ?? "")
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
                    ) : (
                      nearbyStations.map((station) => (
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
                            window.dispatchEvent(
                              new CustomEvent("be-electric-pan-to-station", {
                                detail: {
                                  lat: station.lat,
                                  lng: station.lng,
                                },
                              })
                            );
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
                            <b>
                              {getDistanceKm(
                                START_LOCATION[0],
                                START_LOCATION[1],
                                station.lat,
                                station.lng
                              ).toFixed(1)}{" "}
                              km
                            </b>
                            <small style={{ display: "block", marginTop: 4 }}>
                              {station.status}
                            </small>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      ))
                    )}
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
                          {selected.shortName} · {activeDistance} · {activeMinutes} min
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
                          item.name === "In-App Route Preview" ? "chosen" : ""
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
              ) : panel === "charging" ? (
                <div className="station-details-screen">
                  <header className="details-header">
                    <button
                      className="details-back"
                      onClick={() => setPanel("connector")}
                      aria-label="Back to connector selection"
                    >
                      <ChevronRight
                        size={21}
                        style={{ transform: "rotate(180deg)" }}
                      />
                    </button>
                    <div>
                      <small>CHARGING SETUP</small>
                      <h2>Prepare to charge</h2>
                    </div>
                    <span className="details-live-dot" />
                  </header>

                  <div
                    className="details-scroll"
                    style={{ padding: 18, paddingBottom: 110 }}
                  >
                    <div
                      style={{
                        padding: 20,
                        borderRadius: 20,
                        background: "#edf2ec",
                        textAlign: "center",
                        marginBottom: 22,
                      }}
                    >
                      <div
                        style={{
                          width: 66,
                          height: 66,
                          borderRadius: 20,
                          background: "#dce7dc",
                          color: "#58715d",
                          display: "grid",
                          placeItems: "center",
                          margin: "0 auto 12px",
                        }}
                      >
                        <BatteryCharging size={34} />
                      </div>
                      <h3 style={{ margin: "0 0 6px", color: "#202522" }}>
                        Ready to connect
                      </h3>
                      <p
                        style={{
                          margin: 0,
                          color: "#687168",
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        Charger {stalls.find((item) => item.id === selectedStall)?.chargerId ?? "—"} · {selectedConnector?.connector_type ?? "Connector not selected"}
                        <br />
                        DC fast charging
                      </p>
                    </div>

                    <section style={{ marginBottom: 24 }}>
                      <div className="details-section-heading">
                        <h3>1. Connect your car</h3>
                        <span>REQUIRED</span>
                      </div>

                      <div
                        style={{
                          border: "1px solid #e3e7e1",
                          borderRadius: 16,
                          padding: 15,
                          display: "flex",
                          gap: 12,
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ color: "#58715d", paddingTop: 2 }}>
                          <CarFront size={25} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <strong style={{ color: "#202522", fontSize: 14 }}>
                            Plug the cable into your vehicle
                          </strong>
                          <p
                            style={{
                              color: "#858983",
                              fontSize: 12,
                              lineHeight: 1.6,
                              margin: "6px 0 14px",
                            }}
                          >
                            Connect the CCS2 charging cable to your car.
                            Follow the instructions displayed on the physical
                            charger.
                          </p>
                          <button
                            type="button"
                            disabled={handshakePending || carConnected}
                            onClick={() => void handleCableConnection()}
                            style={{
                              width: "100%",
                              padding: "12px 14px",
                              borderRadius: 12,
                              border: carConnected
                                ? "1px solid #58715d"
                                : "1px solid #d8ddd6",
                              background: carConnected ? "#e5eee6" : "#fff",
                              color: "#36543c",
                              fontWeight: 600,
                              cursor:
                                handshakePending || carConnected
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: handshakePending ? 0.7 : 1,
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            {carConnected ? (
                              <>
                                <Check size={17} />
                                Cable connected
                              </>
                            ) : handshakePending ? (
                              <>
                                <Activity size={17} />
                                Waiting for charger handshake…
                              </>
                            ) : (
                              <>
                                <PlugZap size={17} />
                                Confirm cable is connected
                              </>
                            )}
                          </button>
                          
                          {handshakeError && (
                            <p
                              role="alert"
                              style={{
                                color: "#b54747",
                                fontSize: 12,
                                lineHeight: 1.5,
                                marginTop: 8,
                              }}
                            >
                              {handshakeError}
                            </p>
                          )}
                        </div>
                      </div>
                    </section>

                    <section style={{ marginBottom: 24 }}>
                      <div className="details-section-heading">
                        <h3>2. Set charging limit</h3>
                        <span>BATTERY %</span>
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          color: "#858983",
                          lineHeight: 1.6,
                          margin: "0 0 14px",
                        }}
                      >
                        Choose the battery percentage at which you want
                        charging to stop.
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: 9,
                        }}
                      >
                        {CHARGING_TARGETS.map((target) => {
                          const targetValue = String(target);
                          const isSelected = chargeTarget === targetValue;

                          return (
                            <button
                              key={target}
                              type="button"
                              onClick={() => {
                                setChargeTarget(targetValue);
                                setCustomTarget("");
                              }}
                              aria-pressed={isSelected}
                              style={{
                                minHeight: 55,
                                borderRadius: 13,
                                border: isSelected
                                  ? "2px solid #58715d"
                                  : "1px solid #e2e6df",
                                background: isSelected ? "#e5eee6" : "#fff",
                                color: isSelected ? "#36543c" : "#343a34",
                                fontSize: 16,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {target}%
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => setChargeTarget("Custom")}
                          aria-pressed={chargeTarget === "Custom"}
                          style={{
                            minHeight: 55,
                            borderRadius: 13,
                            border:
                              chargeTarget === "Custom"
                                ? "2px solid #58715d"
                                : "1px solid #e2e6df",
                            background:
                              chargeTarget === "Custom" ? "#e5eee6" : "#fff",
                            color:
                              chargeTarget === "Custom" ? "#36543c" : "#343a34",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Custom
                        </button>
                      </div>

                      {chargeTarget === "Custom" && (
                        <div style={{ marginTop: 15 }}>
                          <label
                            htmlFor="custom-charge-target"
                            style={{
                              display: "block",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#343a34",
                              marginBottom: 8,
                            }}
                          >
                            Custom battery target
                          </label>
                          <div style={{ position: "relative" }}>
                            <input
                              id="custom-charge-target"
                              type="number"
                              min={10}
                              max={100}
                              step={1}
                              inputMode="numeric"
                              placeholder="Enter 10–100"
                              value={customTarget}
                              onChange={(event) =>
                                setCustomTarget(event.target.value)
                              }
                              style={{
                                width: "100%",
                                boxSizing: "border-box",
                                padding: "14px 45px 14px 14px",
                                border: "1px solid #dfe4dc",
                                borderRadius: 12,
                                background: "#fff",
                                color: "#202522",
                                fontSize: 16,
                                outlineColor: "#58715d",
                              }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                right: 15,
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "#858983",
                                fontWeight: 600,
                              }}
                            >
                              %
                            </span>
                          </div>
                          <small
                            style={{
                              display: "block",
                              marginTop: 7,
                              color: "#858983",
                              fontSize: 11,
                            }}
                          >
                            Enter a whole number from 10% to 100%.
                          </small>
                          {customTarget !== "" && !validChargeTarget && (
                            <p
                              style={{
                                color: "#b54747",
                                fontSize: 12,
                                marginTop: 7,
                              }}
                            >
                              Enter a valid whole percentage from 10 to 100.
                            </p>
                          )}
                        </div>
                      )}
                    </section>

                    <div
                      style={{
                        padding: 17,
                        borderRadius: 16,
                        background: "#f4f5f2",
                        marginBottom: 18,
                      }}
                    >
                      <small
                        style={{
                          display: "block",
                          color: "#858983",
                          fontSize: 11,
                          letterSpacing: 1,
                          marginBottom: 8,
                        }}
                      >
                        YOUR CHARGING TARGET
                      </small>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <strong
                          style={{
                            fontSize: 34,
                            color: "#36543c",
                            letterSpacing: -1,
                          }}
                        >
                          {chargeTarget === "Custom"
                            ? validChargeTarget
                              ? `${effectiveChargeTarget}%`
                              : "--"
                            : `${chargeTarget}%`}
                        </strong>
                        <BatteryCharging size={31} color="#58715d" />
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          color: "#858983",
                          lineHeight: 1.6,
                          margin: "8px 0 0",
                        }}
                      >
                        Your selected target is a requested battery level.
                        Automatic stopping requires support from the vehicle
                        and charging system.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="primary-button"
                      disabled={!carConnected || !validChargeTarget}
                      onClick={() => setPanel("charging-review")}
                      style={{
                        opacity:
                          !carConnected || !validChargeTarget ? 0.5 : 1,
                        cursor:
                          !carConnected || !validChargeTarget
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      Review charging setup <ChevronRight size={18} />
                    </button>

                    <p
                      style={{
                        color: "#858983",
                        fontSize: 11,
                        lineHeight: 1.6,
                        textAlign: "center",
                        marginTop: 12,
                      }}
                    >
                      Demo only. This screen cannot verify a physical cable
                      connection.
                    </p>
                  </div>
                </div>
              ) : panel === "charging-review" ? (
                <div className="station-details-screen">
                  <header className="details-header">
                    <button
                      className="details-back"
                      onClick={() => setPanel("charging")}
                      aria-label="Back to charging setup"
                    >
                      <ChevronRight
                        size={21}
                        style={{ transform: "rotate(180deg)" }}
                      />
                    </button>
                    <div>
                      <small>FINAL STEP</small>
                      <h2>Review setup</h2>
                    </div>
                    <span className="details-live-dot" />
                  </header>

                  <div
                    className="details-scroll"
                    style={{ padding: 20, paddingBottom: 100 }}
                  >
                    <div
                      style={{
                        textAlign: "center",
                        padding: "28px 15px",
                        background: "#edf2ec",
                        borderRadius: 20,
                        marginBottom: 22,
                      }}
                    >
                      <BatteryCharging
                        size={46}
                        color="#58715d"
                        style={{ margin: "0 auto 14px" }}
                      />
                      <h3 style={{ color: "#202522", margin: "0 0 8px" }}>
                        Review your charging setup
                      </h3>
                      <p
                        style={{
                          color: "#687168",
                          fontSize: 13,
                          lineHeight: 1.6,
                          margin: 0,
                        }}
                      >
                        Check your connector and charging target before
                        proceeding.
                      </p>
                    </div>

                    <div
                      style={{
                        border: "1px solid #e3e7e1",
                        borderRadius: 16,
                        padding: 16,
                        marginBottom: 14,
                      }}
                    >
                      <small style={{ color: "#858983" }}>
                        CHARGING LOCATION
                      </small>
                      <h3 style={{ margin: "6px 0", color: "#202522" }}>
                        {selected.name}
                      </h3>
                      <p
                        style={{
                          color: "#858983",
                          fontSize: 12,
                          margin: 0,
                        }}
                      >
                        Charger {stalls.find((item) => item.id === selectedStall)?.chargerId ?? "—"} · {selectedConnector?.connector_type ?? "Connector not selected"}
                      </p>
                    </div>

                    <div
                      style={{
                        border: "1px solid #e3e7e1",
                        borderRadius: 16,
                        padding: 16,
                        marginBottom: 22,
                      }}
                    >
                      <small style={{ color: "#858983" }}>
                        STOP AT BATTERY LEVEL
                      </small>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 8,
                        }}
                      >
                        <strong style={{ fontSize: 38, color: "#36543c" }}>
                          {effectiveChargeTarget}%
                        </strong>
                        <Check size={24} color="#58715d" />
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#fff5e6",
                        color: "#805b23",
                        borderRadius: 13,
                        padding: 13,
                        fontSize: 12,
                        lineHeight: 1.6,
                        marginBottom: 20,
                      }}
                    >
                      <strong>Demo mode:</strong> Confirming these settings
                      does not activate a physical charger or guarantee
                      automatic stopping.
                    </div>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        notify(
                          `Demo setup saved: Stall ${selectedStall}, target ${effectiveChargeTarget}%. No charger was activated.`
                        );
                        setPanel("details");
                      }}
                    >
                      <Check size={18} /> Confirm demo setup
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setPanel("charging")}
                      style={{ marginTop: 10 }}
                    >
                      Edit charging settings
                    </button>
                  </div>
                </div>
              ) : panel === "connector" ? (
                <div className="station-details-screen connector-selection-screen">
                  <header className="details-header">
                    <button
                      className="details-back"
                      onClick={() => {
                        setPanel("details");
                        setSheetDragY(0);
                      }}
                      aria-label="Back to station details"
                    >
                      <ChevronRight size={21} style={{ transform: "rotate(180deg)" }} />
                    </button>
                    <div>
                      <small>CONNECTOR SELECTION</small>
                      <h2>Charger {stalls.find((item) => item.id === selectedStall)?.chargerId ?? "—"}</h2>
                    </div>
                    <span className="details-live-dot" />
                  </header>

                  <div className="details-scroll connector-scroll">
                    <div className="connector-intro">
                      <div className="details-location-icon">
                        <PlugZap size={27} />
                      </div>
                      <h3>Choose your connector</h3>
                      <p>Select an available connector from this charger.</p>
                    </div>

                    <div className="connector-summary">
                      <span>Charger {stalls.find((item) => item.id === selectedStall)?.chargerId ?? "—"}</span>
                      <span>{stalls.find((item) => item.id === selectedStall)?.connectors.length ?? 0} connectors</span>
                    </div>

                    <div className="connector-list">
                      {(stalls.find((item) => item.id === selectedStall)?.connectors ?? []).map((connector) => {
                        const available = isAvailableStatus(connector.status);
                        return (
                          <button
                            key={String(connector.id)}
                            type="button"
                            className={`connector-card ${available ? "connector-available" : "connector-occupied"}`}
                            onClick={() => selectConnector(connector)}
                            disabled={!available}
                            aria-disabled={!available}
                          >
                            <span className="connector-card-icon">
                              <StallChargerIcon size={34} />
                            </span>
                            <span className="connector-card-info">
                              <strong>{connector.connector_type}</strong>
                              <small>
                                Connector {connector.connector_number}
                                {connector.max_power_kw != null
                                  ? ` · ${connector.max_power_kw} kW`
                                  : ""}
                              </small>
                              <span className={`connector-status ${available ? "available-status" : "occupied-status"}`}>
                                <span className={available ? "stall-status-dot" : "occupied-status-dot"} />
                                {connector.status || "Unknown"}
                              </span>
                            </span>
                            <span className="connector-select-icon">
                              {available ? <ChevronRight size={19} /> : <X size={18} />}
                            </span>
                          </button>
                        );
                      })}
                      {(stalls.find((item) => item.id === selectedStall)?.connectors.length ?? 0) === 0 && (
                        <div className="empty-state">
                          <PlugZap size={24} />
                          <b>No connectors found</b>
                          <p>This charger has no connector records in the database.</p>
                        </div>
                      )}
                    </div>

                    <div className="connector-note">
                      <CircleDot size={17} />
                      <p>Connector types and statuses are loaded from the database.</p>
                    </div>
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
                        <span className="details-eyebrow">BE-ELECTRIC NETWORK</span>
                        <h3>{selected.name}</h3>
                        <p>{selected.address}</p>
                      </div>
                      <span className="details-open-badge">{selected.status}</span>
                    </div>
                      <button className="primary-button" onClick={openRoute}>
                        <Navigation size={18} /> Get Directions
                      </button>
                    <section className="details-section">

                      <div className="details-section-heading">
                        <h3>Chargers</h3>
                        <span>DATABASE</span>
                      </div>

                      <div className="stall-availability-summary">
                        <div>
                          <strong> {availableStalls.length} of {stalls.length} available </strong>
                          <p>Charger availability from database status</p>
                        </div>
                      </div>

                      
<div
  className="stall-grid"
  style={{
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  }}
>
  {stalls.map((stall) => (
    <button
      key={stall.id}
      type="button"
      className={`stall-option ${
        isAvailableStatus(stall.status)
          ? "stall-available"
          : "stall-occupied"
      }`}
      onClick={() => openStall(stall.id, stall.status)}
      aria-label={`Charger ${stall.chargerId}: ${stall.status}, ${stall.power} kW`}
    >
      <span className="stall-number">
        Charger {stall.chargerId}
      </span>

      {/* Keep the charger icon visible */}
      <span className="stall-charger-icon">
        <StallChargerIcon size={29} />
      </span>

      <strong>{stall.status}</strong>

      <span className="stall-power-output">
        {stall.power} <small>kW</small>
      </span>

      <small>
        {stall.connectors.length} connector
        {stall.connectors.length === 1 ? "" : "s"}
      </small>
    </button>
  ))}
</div>


                      <p className="details-note">
                        Charger IDs, status, power, and connector counts are loaded from your database.
                      </p>
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
                        saved.includes(String(selected.id)) ? "saved" : ""
                      }`}
                      onClick={() => void toggleSavedStation(selected.id)}
                      disabled={savingStationId !== null}
                      aria-label={
                        saved.includes(String(selected.id))
                          ? "Remove saved station"
                          : "Save station"
                      }
                      aria-pressed={saved.includes(String(selected.id))}
                      title={
                        saved.includes(String(selected.id))
                          ? "Remove saved station"
                          : "Save station"
                      }
                    >
                      {saved.includes(String(selected.id)) ? (
                        <BookmarkCheck size={19} />
                      ) : (
                        <Bookmark size={19} />
                      )}
                    </button>
                  </div>

                  <p className="station-address">{selected.address}</p>

<div className="station-summary">
  <span>
    {(() => {
      const station = stations.find(
        (item) => String(item.id) === String(selected.id)
      ) as StationWithChargers | undefined;

      const chargers = station?.chargers ?? [];

      const available = chargers.filter((charger) =>
        isAvailableStatus(charger.status)
      ).length;

      return `${available} of ${chargers.length} chargers available`;
    })()}
  </span>

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
                            <small>{getAvailabilityLabel(station)}</small>
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
                              {route.distance} · {route.minutes} min · {route.completedAt}
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
      Manage your account and Be-Electric preferences.
    </p>

    {profileLoading ? (
      <div className="empty-state">
        <UserRound size={26} />
        <b>Loading your profile...</b>
        <p>Retrieving your account information.</p>
      </div>
    ) : profileError ? (
      <div className="empty-state">
        <UserRound size={26} />
        <b>Unable to load your profile</b>
        <p>{profileError}</p>

        <button
          type="button"
          onClick={() => {
            setProfileError("");
            setActiveTab("Explore");
            window.setTimeout(() => setActiveTab("Profile"), 0);
          }}
        >
          Try again
        </button>
      </div>
    ) : userProfile ? (
      <>
        <div className="profile-card">
          <div className="avatar">
            <UserRound size={25} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <b>
              {userProfile.fullName ||
                userProfile.name ||
                "Be-Electric user"}
            </b>
            <small>{userProfile.email || "Email not provided"}</small>
          </div>

          <span className="demo-tag">ACCOUNT</span>
        </div>

        <section className="details-section">
          <div className="details-section-heading">
            <h3>Personal information</h3>
            <span>ACCOUNT</span>
          </div>

          <div className="operating-card">
            <span className="operating-icon">
              <UserRound size={20} />
            </span>
            <div>
              <strong>Full name</strong>
              <p>
                {userProfile.fullName ||
                  userProfile.name ||
                  "Not provided"}
              </p>
            </div>
          </div>

          <div className="operating-card">
            <span className="operating-icon">
              <Activity size={20} />
            </span>
            <div>
              <strong>Email address</strong>
              <p>{userProfile.email || "Not provided"}</p>
            </div>
          </div>

          <div className="operating-card">
            <span className="operating-icon">
              <CircleDot size={20} />
            </span>
            <div>
              <strong>Phone number</strong>
              <p>{userProfile.phone || "Not provided"}</p>
            </div>
          </div>

          {userProfile.createdAt && (
            <div className="operating-card">
              <span className="operating-icon">
                <History size={20} />
              </span>
              <div>
                <strong>Member since</strong>
                <p>
                  {new Date(userProfile.createdAt).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }
                  )}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="details-section">
          <div className="details-section-heading">
            <h3>Preferences</h3>
            <span>SETTINGS</span>
          </div>

          {[
            {
              label: "Account details",
              icon: <UserRound size={18} />,
            },
            {
              label: "Notifications",
              icon: <Activity size={18} />,
            },
            {
              label: "Charging preferences",
              icon: <Settings2 size={18} />,
            },
            {
              label: "Privacy & security",
              icon: <CircleDot size={18} />,
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="settings-row"
              onClick={() =>
                notify(`${item.label} settings are not connected yet.`)
              }
            >
              <span>{item.icon}</span>
              {item.label}
              <ChevronRight size={18} />
            </button>
          ))}
        </section>

        <button
          type="button"
          className="secondary-button"
          style={{ marginTop: 18, marginBottom: 20 }}
          onClick={async () => {
            try {
              const response = await fetch(
                "/api/stations/auth/logout",
                {
                  method: "POST",
                  credentials: "include",
                }
              );

              if (!response.ok) {
                throw new Error("Sign out failed.");
              }

              window.location.assign("/auth");
            } catch {
              notify(
                "Unable to sign out. Check your logout API route."
              );
            }
          }}
        >
          Sign out
        </button>
      </>
    ) : (
      <div className="empty-state">
        <UserRound size={26} />
        <b>No profile information found</b>
        <p>
          Sign in again or check that your profile API returns the
          authenticated user's details.
        </p>

        <button
          type="button"
          onClick={() => window.location.assign("/auth")}
        >
          Go to login
        </button>
      </div>
    )}
  </>
)}
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
                      window.dispatchEvent(new Event("be-electric-map-visible"));
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
              setSelectedStall(null);
              setChargeTarget("80");
              setCustomTarget("");
              setCarConnected(false);
            }}
          >
            Reset demo <History size={13} />
          </button>
        </div>
      </section>
    </main>
  );
}
