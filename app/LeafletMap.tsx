"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Station = {
  lat: number;
  lng: number;
  id: string;
  name: string;
  shortName: string;
  address: string;
  plugs: number | null;
  available: number | null;
  power: number | null;
  price: number | null;
  kind: "DC fast" | "AC";
  distance: string;
  minutes: number;
  status: string;
};


type Props = {
  stations: Station[];
  selectedId: string;
  routeMode: boolean;
  onSelect: (id: string) => void;
  onRouteCalculated?: (metrics: {
    distance: string;
    minutes: number;
  }) => void;
};
///25.25443628041169, 51.47908688248179
const start: [number, number] = [25.39843662939004, 51.51449314830205];

function stationIcon(station: Station, selected: boolean) {
  return L.divIcon({
    className: "leaflet-station-icon-wrap",
    html: `<div class="leaflet-station-icon ${selected ? "is-selected" : ""} ${station.available === 0 ? "is-offline" : ""}"><span class="bolt">ϟ</span><span class="count">${station.available}</span>${selected ? '<small>SELECTED</small>' : ""}</div>`,
    iconSize: selected ? [64, 62] : [50, 48],
    iconAnchor: selected ? [32, 31] : [25, 24],
  });
}

function MapController({
  routeCoords,
  routeMode,
}: {
  routeCoords: [number, number][];
  routeMode: boolean;
}) {
  const map = useMap();
  const lastFittedRouteKey = useRef<string | null>(null);

  useEffect(() => {
    const locate = () => map.flyTo(start, 15, { duration: 0.7 });
    const refreshMapSize = () => {
      // The map is hidden while another bottom-navigation tab is active.
      window.setTimeout(() => {
        map.invalidateSize({ pan: false, animate: false });
      }, 100);
    };

    const panToStation = (event: Event) => {
      const customEvent = event as CustomEvent<{ lat: number; lng: number }>;
      const { lat, lng } = customEvent.detail ?? {};
      if (typeof lat !== "number" || typeof lng !== "number") return;
      map.flyTo([lat, lng], Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.9,
      });
    };

    window.addEventListener("be-electric-locate", locate);
    window.addEventListener("be-electric-map-visible", refreshMapSize);
    window.addEventListener("be-electric-pan-to-station", panToStation);
    return () => {
      window.removeEventListener("be-electric-locate", locate);
      window.removeEventListener("be-electric-map-visible", refreshMapSize);
      window.removeEventListener("be-electric-pan-to-station", panToStation);
    };
  }, [map]);

  // The map container can resize when the route sheet opens. Tell Leaflet to
  // recalculate its dimensions without changing the user's chosen zoom.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize({ pan: false, animate: false });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [map, routeMode]);

  useEffect(() => {
    if (routeCoords.length < 2) {
      lastFittedRouteKey.current = null;
      return;
    }

    const first = routeCoords[0];
    const last = routeCoords[routeCoords.length - 1];
    const routeKey = `${first[0]},${first[1]}:${last[0]},${last[1]}`;

    // Route fetching may rerun after parent renders. Don't fit the same route
    // again, because fitBounds would override any manual zoom/pan.
    if (lastFittedRouteKey.current === routeKey) return;
    lastFittedRouteKey.current = routeKey;

    map.fitBounds(L.latLngBounds(routeCoords), {
      padding: [60, 60],
      animate: false,
    });
  }, [map, routeCoords]);

  return null;
}

export default function LeafletMap({
  stations,
  selectedId,
  routeMode,
  onSelect,
  onRouteCalculated,
}: Props) {
  const selected = stations.find((station) => station.id === selectedId);
  const [roadCoordinates, setRoadCoordinates] = useState<[number, number][]>([]);
  const onRouteCalculatedRef = useRef(onRouteCalculated);

  // Keep the latest callback without making route fetching depend on the
  // callback's identity (which can change on every parent render).
  useEffect(() => {
    onRouteCalculatedRef.current = onRouteCalculated;
  }, [onRouteCalculated]);

  const selectedLat = selected?.lat;
  const selectedLng = selected?.lng;
  const selectedStationId = selected?.id;

  useEffect(() => {
    if (!routeMode || selectedLat == null || selectedLng == null) {
      setRoadCoordinates([]);
      return;
    }

    const controller = new AbortController();

    async function fetchDrivingRoute() {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${selectedLng},${selectedLat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Route request failed: ${res.status}`);
        const data = await res.json();

        if (data.code === "Ok" && data.routes?.[0]) {
          const route = data.routes[0];
          const latLngs: [number, number][] = route.geometry.coordinates.map(
            ([lng, lat]: [number, number]) => [lat, lng]
          );
          setRoadCoordinates(latLngs);

          onRouteCalculatedRef.current?.({
            distance: `${(route.distance / 1000).toFixed(1)} km`,
            minutes: Math.max(1, Math.round(route.duration / 60)),
          });
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("Failed to fetch road network route:", err);
        }
      }
    }

    fetchDrivingRoute();
    return () => controller.abort();
  }, [routeMode, selectedStationId, selectedLat, selectedLng]);

  return (
    <div className={`leaflet-map-root ${routeMode ? "is-routing" : ""}`}>
      <MapContainer
        center={start}
        zoom={15}
        zoomControl={false}
        scrollWheelZoom={true}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapController routeCoords={roadCoordinates} routeMode={routeMode} />
        <CircleMarker
          center={start}
          radius={8}
          pathOptions={{
            color: "#ffffff",
            weight: 4,
            fillColor: "#91a795",
            fillOpacity: 1,
          }}
        >
          <Popup><strong>Your Location</strong></Popup>
        </CircleMarker>
        
        {stations.map((station) => (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={stationIcon(station, selectedId === station.id)}
            eventHandlers={{ click: () => onSelect(station.id) }}
          >
            <Popup>
              <div className="station-popup">
                <strong>{station.name}</strong>
                <span>{station.address}</span>
                <span>
                  {station.power != null
                    ? `${station.power} kW`
                    : "Power not specified"}
                </span>
                <span>Status: {station.status}</span>
                <button onClick={() => onSelect(station.id)}>
                  View station
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {routeMode && roadCoordinates.length > 0 && (
          <>
            <Polyline
              positions={roadCoordinates}
              pathOptions={{
                color: "#ffffff",
                weight: 8,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <Polyline
              positions={roadCoordinates}
              pathOptions={{
                color: "#58715d",
                weight: 5,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
