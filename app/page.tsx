 "use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity, ArrowLeft, ArrowRight, Bookmark, Check, ChevronRight, CircleDot,
  Clock3, Crosshair, Layers, List, LocateFixed, Map, MapPin, Menu, Navigation,
  PlugZap, Search, SlidersHorizontal, UserRound, X, Zap, CarFront, Route,
  BatteryCharging, Compass, Settings2, History, BookmarkCheck
} from "lucide-react";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false, loading: () => <div className="leaflet-loading">Loading OpenStreetMap…</div> });

type Station = {
  lat: number; lng: number; id: number; name: string; shortName: string; address: string; plugs: number;
  available: number; power: number; price: number; kind: "DC fast" | "AC";
  distance: string; minutes: number;
};

const stations: Station[] = [
  {
    id: 1,
    name: "Souq Waqif Charging Hub",
    shortName: "Souq Waqif",
    address: "Souq Waqif, Doha, Qatar",
    plugs: 8,
    available: 5,
    power: 150,
    price: 0.20,
    kind: "DC fast",
    lat: 25.2867,
    lng: 51.5333,
    distance: "1.2 km",
    minutes: 4,
  },
  {
    id: 2,
    name: "Doha Corniche Charger",
    shortName: "Doha Corniche",
    address: "Doha Corniche, Qatar",
    plugs: 6,
    available: 3,
    power: 100,
    price: 0.20,
    kind: "DC fast",
    lat: 25.2950,
    lng: 51.5390,
    distance: "1.8 km",
    minutes: 6,
  },
  {
    id: 3,
    name: "Msheireb Charging Point",
    shortName: "Msheireb",
    address: "Msheireb Downtown, Doha, Qatar",
    plugs: 4,
    available: 2,
    power: 50,
    price: 0.20,
    kind: "AC",
    lat: 25.2850,
    lng: 51.5260,
    distance: "2.0 km",
    minutes: 7,
  },
  {
    id: 4,
    name: "West Bay Charging Hub",
    shortName: "West Bay",
    address: "West Bay, Doha, Qatar",
    plugs: 10,
    available: 7,
    power: 150,
    price: 0.20,
    kind: "DC fast",
    lat: 25.3219,
    lng: 51.5310,
    distance: "4.5 km",
    minutes: 12,
  },
  {
    id: 5,
    name: "Katara Charging Point",
    shortName: "Katara",
    address: "Katara Cultural Village, Doha, Qatar",
    plugs: 4,
    available: 1,
    power: 22,
    price: 0.20,
    kind: "AC",
    lat: 25.3615,
    lng: 51.5260,
    distance: "8.0 km",
    minutes: 18,
  },
  {
    id: 6,
    name: "Al Waab Nearby Charging Hub",
    shortName: "Al Waab",
    address: "Al Waab, Doha, Qatar",
    plugs: 4,
    available: 3,
    power: 50,
    price: 0.20,
    kind: "DC fast",
    lat: 25.2580,
    lng: 51.4820,
    distance: "0.5 km",
    minutes: 2,
  },
  {
    id: 7,
    name: "Salwa Road Charging Point",
    shortName: "Salwa Road",
    address: "Salwa Road, Doha, Qatar",
    plugs: 6,
    available: 4,
    power: 100,
    price: 0.20,
    kind: "DC fast",
    lat: 25.2505,
    lng: 51.4860,
    distance: "0.8 km",
    minutes: 3,
  },
  {
    id: 8,
    name: "Abu Hamour Charging Hub",
    shortName: "Abu Hamour",
    address: "Abu Hamour, Doha, Qatar",
    plugs: 4,
    available: 2,
    power: 22,
    price: 0.20,
    kind: "AC",
    lat: 25.2445,
    lng: 51.4780,
    distance: "1.2 km",
    minutes: 4,
  },
  {
    id: 9,
    name: "Al Maamoura Charging Point",
    shortName: "Al Maamoura",
    address: "Al Maamoura, Doha, Qatar",
    plugs: 4,
    available: 3,
    power: 50,
    price: 0.20,
    kind: "DC fast",
    lat: 25.2465,
    lng: 51.4900,
    distance: "1.5 km",
    minutes: 5,
  },
  {
    id: 10,
    name: "Starting Point Charging Hub",
    shortName: "Nearby Hub",
    address: "Near your starting point, Doha, Qatar",
    plugs: 2,
    available: 1,
    power: 22,
    price: 0.20,
    kind: "AC",
    lat: 25.2555,
    lng: 51.4765,
    distance: "0.3 km",
    minutes: 1,
  },
];

type Tab = "Explore" | "Saved" | "Activity" | "Profile";
type Panel = "route" | "chooser" | "station" | null;

function MapArtwork({ routeMode = false }: { routeMode?: boolean }) {
  return (
    <svg className="map-art" viewBox="0 0 390 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="390" height="700" fill="#f5f5f2" />
      <path d="M278 -20 L390 0 L390 700 L315 700 L354 430 L316 318 L274 240 Z" fill="#e6e8e5" />
      <path d="M250 0 L274 235 L305 278 L350 420 L310 700" fill="none" stroke="#c8cbc7" strokeWidth="7" />
      <g stroke="#d6d8d4" strokeWidth="2.7" fill="none">
        <path d="M-30 80 L360 470"/><path d="M-20 160 L330 510"/><path d="M-30 245 L290 565"/>
        <path d="M15 0 L390 375"/><path d="M75 -10 L390 305"/><path d="M150 -20 L390 220"/>
        <path d="M-30 350 L280 40"/><path d="M-20 445 L330 95"/><path d="M-30 550 L360 160"/>
        <path d="M15 660 L390 285"/><path d="M95 710 L390 415"/><path d="M-10 300 L390 700"/>
        <path d="M-10 410 L290 710"/><path d="M90 0 L0 95"/><path d="M210 0 L0 215"/>
      </g>
      <g stroke="#fff" strokeWidth="5" fill="none" opacity=".9">
        <path d="M-20 530 L130 380 L270 240 L390 120"/>
        <path d="M20 700 L155 565 L305 415 L390 330"/>
      </g>
      <path d="M98 420 L220 300 L275 350 L210 415 L245 447" fill="none" stroke="#dce2dc" strokeWidth="26" />
      {routeMode && <path d="M98 420 L170 350 L220 390 L303 305" fill="none" stroke="#8fa795" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />}
      <g fill="#7e827d" fontSize="9" fontFamily="Arial, sans-serif" letterSpacing=".6">
        <text x="37" y="235">WEST BAY</text>
        <text x="36" y="555">SOMA</text>
        <text x="116" y="365" transform="rotate(-43 116 365)">SOUQ WAQIF</text>
        <text x="242" y="345" transform="rotate(-48 242 345)">MSHEIREB</text>
        <text x="298" y="390" transform="rotate(70 298 390)">CORNICHE</text>
        <text x="305" y="620">DOHA, QATAR</text>
      </g>
      <circle cx="98" cy="420" r="23" fill="#e8ece7" opacity=".9" />
      <circle cx="98" cy="420" r="9" fill="#91a795" stroke="#fff" strokeWidth="4" />
      <g fill="#a3a6a1" fontSize="9" fontFamily="Arial, sans-serif"><text x="52" y="449">Souq Waqif</text><text x="20" y="600">Doha</text></g>
      <path d="M20 610 H62" stroke="#8f938d" strokeWidth="2" />
    </svg>
  );
}


const START_LOCATION: [number, number] = [
  25.25443628041169,
  51.47908688248179,
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

export default function Home() {
  const [selectedId, setSelectedId] = useState(1);
  const [activeTab, setActiveTab] = useState<Tab>("Explore");
  const [panel, setPanel] = useState<Panel>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [search, setSearch] = useState("");
  const [fastOnly, setFastOnly] = useState(true);
  const [acOnly, setAcOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [layersOpen, setLayersOpen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetPointerStart = useRef<number | null>(null);
  const [calculatedRoute, setCalculatedRoute] = useState<{ distance: string; minutes: number } | null>(null);

  function handleSheetPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    sheetPointerStart.current = event.clientY;
    setSheetDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSheetPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!sheetDragging || sheetPointerStart.current === null) return;
    // Allow sheets to slide down behind the bottom navigation.
    const delta = event.clientY - sheetPointerStart.current;
    setSheetDragY(Math.max(-120, Math.min(520, delta)));
  }

  function handleSheetPointerUp() {
    setSheetDragging(false);
    sheetPointerStart.current = null;
    // Snap up, back to rest, or down near the bottom navigation.
    setSheetDragY(current => current < -45 ? -70 : current > 80 ? 320 : 0);
  }

  // Keep the route sheet's handle visible so it can always be pulled back up.
  function handleRouteSheetPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!sheetDragging || sheetPointerStart.current === null) return;
    const delta = event.clientY - sheetPointerStart.current;
    setSheetDragY(Math.max(-120, Math.min(105, delta)));
  }

  function handleRouteSheetPointerUp() {
    setSheetDragging(false);
    sheetPointerStart.current = null;
    setSheetDragY(current => current < -45 ? -70 : current > 55 ? 65 : 0);
  }

  const selected = stations.find(s => s.id === selectedId) ?? stations[0];
  const activeMinutes = calculatedRoute?.minutes ?? selected.minutes;
  const activeDistance = calculatedRoute?.distance ?? selected.distance;
  
const filtered = useMemo(
  () =>
    stations.filter(
      (s) =>
        (!fastOnly || s.kind === "DC fast") &&
        (!acOnly || s.kind === "AC") &&
        (!availableOnly || s.available >= 2) &&
        `${s.name} ${s.address} ${s.id}`
          .toLowerCase()
          .includes(search.toLowerCase())
    ),
  [search, fastOnly, acOnly, availableOnly]
);

// Only stations 1–5 km from the starting point.
const nearbyStations = useMemo(
  () =>
    filtered.filter((s) => {
      const distance = getDistanceKm(
        START_LOCATION[0],
        START_LOCATION[1],
        s.lat,
        s.lng
      );

      return distance >= 1 && distance <= 5;
    }),
  [filtered]
);
  const savedStations = stations.filter(s => saved.includes(s.id));

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
    const destination = encodeURIComponent(`${selected.name}, ${selected.address}`);
    const urls: Record<string, string> = {
      "Google Maps": `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
      "Apple Maps": `https://maps.apple.com/?daddr=${destination}`,
      "Waze": `https://waze.com/ul?q=${destination}&navigate=yes`
    };
    if (urls[app]) window.open(urls[app], "_blank", "noopener,noreferrer");
    else { setPanel("route"); setRouteMode(true); }
  }

  return (
    <main className="desktop-shell">
      <aside className="desktop-intro">
        <div className="brand-lockup"><span className="brand-icon"><Zap size={22} /></span><span>be-electric</span></div>
        <span className="eyebrow">EV CHARGING, SIMPLIFIED</span>
        <h1>Find your charge.<br /><em>Keep moving.</em></h1>
        <p>A clickable prototype of your Be-Electric mobile experience. Explore charging stations, preview routes, and try the interface right here.</p>
        <div className="intro-points">
          <div><span><MapPin size={17}/></span><div><b>Explore nearby</b><small>Search stations around Doha, Qatar.</small></div></div>
          <div><span><Route size={17}/></span><div><b>Preview your route</b><small>See a route summary before navigating.</small></div></div>
          <div><span><BatteryCharging size={17}/></span><div><b>Check availability</b><small>Compare plugs, power, and prices.</small></div></div>
        </div>
        <div className="desktop-hint"><span className="hint-dot" /> Interactive demo <span className="hint-divider">·</span> Sample data</div>
      </aside>

      <section className="emulator-column">
        <div className="phone-frame">
          <div className="phone-screen">
            {activeTab === "Explore" ? (
              <div className="map-screen">
                <LeafletMap
                      stations={filtered}
                      selectedId={selectedId}
                      routeMode={routeMode}
                      onSelect={(id: number) => {
                        setSelectedId(id);
                        setPanel("station");
                        setRouteMode(false);
                        setSheetDragY(0);
                        setCalculatedRoute(null);
                      }}
                      onRouteCalculated={(metrics) => setCalculatedRoute(metrics)}
                />
                {panel !== "route" && <div className="search-wrap"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search city, landmark, or charger ID" aria-label="Search chargers"/>{search && <button onClick={() => setSearch("")}><X size={15}/></button>}</div>}
                {panel !== "route" && <div className="filter-row">
                  <button className={`filter-chip ${acOnly ? "active" : ""}`} onClick={() => {setAcOnly(!acOnly); if (!acOnly) setFastOnly(false);}}>AC Charging</button>
                  <button className={`filter-chip ${fastOnly ? "active" : ""}`} onClick={() => {setFastOnly(!fastOnly); if (!fastOnly) setAcOnly(false);}}>{fastOnly && <Check size={13}/>} DC Fast Charger</button>
                  <button className={`filter-chip ${availableOnly ? "active" : ""}`} onClick={() => setAvailableOnly(!availableOnly)}>2+ Plugs Available</button>
                </div>}

                {panel === "route" && <div className="route-top-card"><div><span className="route-origin-dot"/><span>Your location · Doha, Qatar</span></div><div><Zap size={16}/><b>{selected.name}</b></div></div>}

                {panel === "route" && routeMode && (<><div className="route-pill">{activeMinutes} min</div><div className="route-destination-label">{selected.shortName}</div></>)}
                <div className="map-tools">
                  <button className="tool-button" onClick={() => setLayersOpen(!layersOpen)} aria-label="Map layers"><Layers size={19}/></button>
                  <button className="tool-button" onClick={() => { window.dispatchEvent(new Event("be-electric-locate")); notify("Map centered on Doha, Qatar"); }} aria-label="Locate me"><Crosshair size={19}/></button>
                  {layersOpen && <div className="layers-popover"><b>Map layers</b><button onClick={() => {setLayersOpen(false);notify("Standard map selected")}}>Standard <Check size={14}/></button><button onClick={() => {setLayersOpen(false);notify("Charging overlay enabled")}}>Charging overlay</button></div>}
                </div>

                {panel === "route" ? (
                  <div
                    className={`route-bottom-sheet ${sheetDragging ? "sheet-dragging" : ""}`}
                    style={{ transform: `translateY(${sheetDragY}px)`, transition: sheetDragging ? "none" : "transform 180ms ease-out" }}
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
      <small><CarFront size={13}/> Drive</small>
    </div>
                    <h3>{selected.name}</h3>
                    <div className="route-availability"><span>● {selected.available} of {selected.plugs} available</span><small>{selected.power} kW · ${selected.price.toFixed(2)}/kWh</small></div>
                    <button className="primary-button" onClick={() => {setSheetDragY(0); setPanel("chooser"); setRouteMode(false);}}><Navigation size={18}/> Choose other service</button>
                  </div>
                ) : panel === "chooser" ? (
                  <div className="sheet-overlay">
                    <div
                      className={`bottom-sheet chooser-sheet ${
                        sheetDragging ? "sheet-dragging" : ""
                      }`}
                      style={{
                        transform: `translateY(${sheetDragY}px)`,
                        transition: sheetDragging
                          ? "none"
                          : "transform 180ms ease-out",
                      }}
                    ><div
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
          <p>{selected.shortName} · {activeDistance} · {activeMinutes} min</p>
        </div>
        <button className="sheet-close" onClick={() => setPanel("station")}><X size={17}/></button>
      </div>
                      {[
                        {name:"Google Maps", desc:"Traffic-aware directions", icon:<MapPin size={19}/>},
                        {name:"Apple Maps", desc:"Navigate with your iPhone", icon:<Map size={19}/>},
                        {name:"Waze", desc:"Community-powered traffic", icon:<CarFront size={19}/>},
                        {name:"In-App Route Preview", desc:"See the route without leaving Be-Electric", icon:<Route size={19}/>}
                      ].map(item => <button key={item.name} className={`route-option ${item.name === "In-App Route Preview" ? "chosen" : ""}`} onClick={() => externalMap(item.name)}><span className="route-option-icon">{item.icon}</span><span className="route-option-copy"><b>{item.name}</b><small>{item.desc}</small></span><ChevronRight size={18}/></button>)}
                      <p className="chooser-footnote">Your charger stays selected when you return.</p>
                    </div>
                  </div>
                ) : panel === "station" ? (
                  <div
                    className={`station-sheet ${sheetDragging ? "sheet-dragging" : ""}`}
                    style={{ transform: `translateY(${sheetDragY}px)`, transition: sheetDragging ? "none" : "transform 180ms ease-out" }}
                  ><div
                    className="sheet-grabber sheet-drag-handle"
                    onPointerDown={handleSheetPointerDown}
                    onPointerMove={handleSheetPointerMove}
                    onPointerUp={handleSheetPointerUp}
                    onPointerCancel={handleSheetPointerUp}
                    role="separator"
                    aria-label="Drag station details panel"
                  /><div className="sheet-overline">BE-ELECTRIC NETWORK</div><div className="station-title-row"><h2>{selected.name}</h2><button className={`save-button ${saved.includes(selected.id) ? "saved" : ""}`} onClick={() => setSaved(prev => prev.includes(selected.id) ? prev.filter(id => id !== selected.id) : [...prev, selected.id])} aria-label="Save station">{saved.includes(selected.id) ? <BookmarkCheck size={19}/> : <Bookmark size={19}/>}</button></div>
                    <p className="station-address">{selected.address}</p><div className="station-summary"><span>● {selected.available} of {selected.plugs} available</span><small>{selected.distance} · {selected.minutes} min drive</small></div>
                    <div className="spec-grid"><div><small>MAX SPEED</small><b>{selected.power} kW</b><span>{selected.kind} · CCS</span></div><div><small>ENERGY PRICE</small><b>${selected.price.toFixed(2)} /kWh</b><span>Open 24/7</span></div></div>
                    <button className="primary-button" onClick={openRoute}><Navigation size={18}/> Get Directions</button>
                    <button className="sheet-back-link" onClick={() => {setPanel(null);setRouteMode(false);setSheetDragY(0)}}>Back to map</button>
                  </div>
                ) : (
                  <div className="map-bottom-content">
                    <div className="legend"><span><i className="green-dot"/> Available</span><span><i className="gray-dot"/> Busy</span><span><i className="gray-dot"/> Offline</span></div>
                    
<button
  className="nearby-card"
  onClick={() => notify(`${filtered.length} stations shown on the map`)}
>
  <span className="nearby-icon">
    <LocateFixed size={19} />
  </span>
  <span>  
   <b>{filtered.length} nearby stations</b>
   <small>Within 1–5 km of your location</small>
  </span>
  <List size={19} />
</button>

                  </div>
                )}
              </div>
            ) : (
              <div className="other-tab-screen">
                {activeTab === "Saved" && <><h2>Saved stations</h2><p className="tab-subtitle">Your favorite charging spots, all in one place.</p>{savedStations.length ? savedStations.map(s => <button className="saved-card" key={s.id} onClick={() => {setSelectedId(s.id);setActiveTab("Explore");setPanel("station")}}><span className="saved-zap"><Zap size={19}/></span><span><b>{s.name}</b><small>{s.available} of {s.plugs} plugs available · {s.distance}</small></span><ChevronRight size={18}/></button>) : <div className="empty-state"><span><Bookmark size={26}/></span><b>No saved stations yet</b><p>Open a station and tap the bookmark to keep it here.</p><button onClick={() => setActiveTab("Explore")}>Explore stations</button></div>}</>}
                {activeTab === "Activity" && <><h2>Your activity</h2><p className="tab-subtitle">A quick look at your charging journey.</p><div className="activity-card"><span><History size={20}/></span><div><b>Recent routes</b><small>No recent routes in this demo.</small></div></div><div className="activity-card"><span><PlugZap size={20}/></span><div><b>Charging sessions</b><small>Your sessions will appear here.</small></div></div><div className="stat-cards"><div><b>{saved.length}</b><small>Saved stations</small></div><div><b>{stations.length}</b><small>Nearby stations</small></div></div></>}
                {activeTab === "Profile" && <><h2>Your profile</h2><p className="tab-subtitle">Manage your Be-Electric preferences.</p><div className="profile-card"><div className="avatar"><UserRound size={25}/></div><div><b>Guest driver</b><small>Demo account</small></div><span className="demo-tag">DEMO</span></div>{["Account details","Notifications","Charging preferences","Privacy & security"].map((x,i)=><button key={x} className="settings-row" onClick={() => notify(`${x} is a demo setting`)}><span>{[<UserRound size={18}/>,<Activity size={18}/>,<Settings2 size={18}/>,<CircleDot size={18}/>][i]}</span>{x}<ChevronRight size={18}/></button>)}</>}
                <div className="tab-map-mini"><MapArtwork/><button onClick={() => setActiveTab("Explore")}><Compass size={16}/> Back to Explore</button></div>
              </div>
            )}
            <nav className="bottom-nav">
              {([{name:"Explore", icon:<Map size={19}/>},{name:"Saved",icon:<Bookmark size={19}/>},{name:"Activity",icon:<Activity size={19}/>},{name:"Profile",icon:<UserRound size={19}/>} ] as {name:Tab;icon:React.ReactNode}[]).map(item => <button key={item.name} className={activeTab === item.name ? "active" : ""} onClick={() => {setActiveTab(item.name);setPanel(null);setRouteMode(false);setSheetDragY(0)}}>{item.icon}<span>{item.name}</span></button>)}
            </nav>
            <div className="home-indicator"><span/></div>
            {message && <div className="toast">{message}</div>}
          </div>
        </div>
        <div className="emulator-footer"><span><span className="footer-dot"/> Click around to test the prototype</span><button onClick={() => {setActiveTab("Explore");setPanel(null);setRouteMode(false);setSearch("");setFastOnly(true);setAcOnly(false);setAvailableOnly(false);}}>Reset demo <History size={13}/></button></div>
      </section>
    </main>
  );
}
