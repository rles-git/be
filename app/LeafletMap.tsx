"use client";

import { useEffect, useMemo, useState } from "react";
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
  id: number;
  name: string;
  shortName: string;
  address: string;
  plugs: number;
  available: number;
  power: number;
  price: number;
  kind: "DC fast" | "AC";
  lat: number;
  lng: number;
  distance: string;
  minutes: number;
};

type Props = {
  stations: Station[];
  selectedId: number;
  routeMode: boolean;
  onSelect: (id: number) => void;
};

const start: [number, number] = [25.2867, 51.5333]; // Doha, Qatar

type OsrmRoute = {
  geometry: {
    coordinates: [number, number][]; // GeoJSON order: [longitude, latitude]
  };
  distance: number; // meters
  duration: number; // seconds
};

function stationIcon(station: Station, selected: boolean) {
  return L.divIcon({
    className: "leaflet-station-icon-wrap",
    html: `<div class="leaflet-station-icon ${selected ? "is-selected" : ""} ${
      station.available === 0 ? "is-offline" : ""
    }"><span class="bolt">ϟ</span><span class="count">${station.available}</span>${
      selected ? "<small>SELECTED</small>" : ""
    }</div>`,
    iconSize: selected ? [64, 62] : [50, 48],
    iconAnchor: selected ? [32, 31] : [25, 24],
  });
}

function MapEvents({
  route,
  routeMode,
}: {
  route: [number, number][] | null;
  routeMode: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const locate = () => map.flyTo(start, 15, { duration: 0.7 });
    window.addEventListener("be-electric-locate", locate);
    return () => window.removeEventListener("be-electric-locate", locate);
  }, [map]);

  useEffect(() => {
    if (routeMode && route && route.length > 1) {
      map.fitBounds(L.latLngBounds(route), { padding: [48, 48], maxZoom: 16 });
    }
  }, [map, route, routeMode]);

  return null;
}

export default function LeafletMap({
  stations,
  selectedId,
  routeMode,
  onSelect,
}: Props) {
  const selected = stations.find((station) => station.id === selectedId);
  const [roadRoute, setRoadRoute] = useState<[number, number][] | null>(null);
  const [routeError, setRouteError] = useState("");
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const destinationKey = selected ? `${selected.lat},${selected.lng}` : "";

  useEffect(() => {
    if (!routeMode || !selected) {
      setRoadRoute(null);
      setRouteInfo(null);
      setRouteError("");
      setLoadingRoute(false);
      return;
    }

    const controller = new AbortController();

    async function fetchRoadRoute() {
      setLoadingRoute(true);
      setRouteError("");
      setRoadRoute(null);
      setRouteInfo(null);

      // OSRM uses longitude,latitude in the URL, not latitude,longitude.
      const coordinates = `${start[1]},${start[0]};${selected!.lng},${selected!.lat}`;
      const url =
        `https://router.project-osrm.org/route/v1/driving/${coordinates}` +
        "?overview=full&geometries=geojson&steps=true";

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("The routing service is unavailable.");

        const data = await response.json();
        if (data.code !== "Ok" || !data.routes?.length) {
          throw new Error("No drivable road route was found for this destination.");
        }

        const routeData = data.routes[0] as OsrmRoute;
        // Leaflet coordinates are [latitude, longitude].
        const latLngs = routeData.geometry.coordinates.map(
          ([lng, lat]) => [lat, lng] as [number, number],
        );

        setRoadRoute(latLngs);
        setRouteInfo({ distance: routeData.distance, duration: routeData.duration });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setRouteError(
          error instanceof Error
            ? error.message
            : "Could not calculate a road route. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) setLoadingRoute(false);
      }
    }

    void fetchRoadRoute();
    return () => controller.abort();
  }, [routeMode, destinationKey, selectedId]); // Recalculate when destination/route mode changes.

  const route = useMemo(() => roadRoute ?? [], [roadRoute]);

  return (
    <div className="leaflet-map-root">
      <MapContainer
        center={start}
        zoom={13}
        zoomControl={false}
        scrollWheelZoom={true}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapEvents route={route} routeMode={routeMode} />

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
          <Popup>
            <strong>Your starting point</strong>
            <br />
            Doha, Qatar
          </Popup>
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
                <span>
                  {station.available} of {station.plugs} plugs available
                </span>
                <span>
                  {station.power} kW · ${station.price.toFixed(2)}/kWh
                </span>
                <button onClick={() => onSelect(station.id)}>View station</button>
              </div>
            </Popup>
          </Marker>
        ))}

        {routeMode && route.length > 1 && (
          <Polyline
            positions={route}
            pathOptions={{
              color: "#8fa795",
              weight: 6,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}
      </MapContainer>

      {routeMode && (
        <div className="road-route-status" role="status" aria-live="polite">
          {loadingRoute && "Calculating road route…"}
          {!loadingRoute && routeInfo && (
            <>
              Road route · {(routeInfo.distance / 1000).toFixed(1)} km ·{" "}
              {Math.max(1, Math.round(routeInfo.duration / 60))} min estimated
            </>
          )}
          {!loadingRoute && routeError && (
            <span>{routeError} The route line is hidden rather than showing a straight-line path.</span>
          )}
        </div>
      )}
    </div>
  );
}
