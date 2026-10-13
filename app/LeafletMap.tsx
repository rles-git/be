"use client";

import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Station = {
  lat: number; lng: number; id: number; name: string; shortName: string; address: string; plugs: number;
  available: number; power: number; price: number; kind: "DC fast" | "AC";
  distance: string; minutes: number;
};

type Props = {
  stations: Station[];
  selectedId: number;
  routeMode: boolean;
  onSelect: (id: number) => void;
  onRouteCalculated?: (metrics: { distance: string; minutes: number }) => void;
};

const start: [number, number] = [25.25443628041169, 51.47908688248179];

function stationIcon(station: Station, selected: boolean) {
  return L.divIcon({
    className: "leaflet-station-icon-wrap",
    html: `<div class="leaflet-station-icon ${selected ? "is-selected" : ""} ${station.available === 0 ? "is-offline" : ""}"><span class="bolt">ϟ</span><span class="count">${station.available}</span>${selected ? '<small>SELECTED</small>' : ""}</div>`,
    iconSize: selected ? [64, 62] : [50, 48],
    iconAnchor: selected ? [32, 31] : [25, 24],
  });
}

function MapController({ routeCoords }: { routeCoords: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    const locate = () => map.flyTo(start, 15, { duration: 0.7 });
    window.addEventListener("be-electric-locate", locate);
    return () => window.removeEventListener("be-electric-locate", locate);
  }, [map]);

  useEffect(() => {
    if (routeCoords.length > 1) {
      const bounds = L.latLngBounds(routeCoords);
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [map, routeCoords]);

  return null;
}

export default function LeafletMap({ stations, selectedId, routeMode, onSelect, onRouteCalculated }: Props) {
  const selected = stations.find((station) => station.id === selectedId);
  const [roadCoordinates, setRoadCoordinates] = useState<[number, number][]>([]);

  useEffect(() => {
    if (!routeMode || !selected) {
      setRoadCoordinates([]);
      return;
    }

    const controller = new AbortController();

    async function fetchDrivingRoute() {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${selected!.lng},${selected!.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();

        if (data.code === "Ok" && data.routes?.[0]) {
          const route = data.routes[0];
          const latLngs: [number, number][] = route.geometry.coordinates.map(
            ([lng, lat]: [number, number]) => [lat, lng]
          );
          setRoadCoordinates(latLngs);

          if (onRouteCalculated) {
            const distanceKm = (route.distance / 1000).toFixed(1);
            const durationMin = Math.max(1, Math.round(route.duration / 60));
            onRouteCalculated({
              distance: `${distanceKm} km`,
              minutes: durationMin,
            });
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("Failed to fetch road network route:", err);
        }
      }
    }

    fetchDrivingRoute();
    return () => controller.abort();
  }, [routeMode, selected, onRouteCalculated]);

  return (
    <div className={`leaflet-map-root ${routeMode ? "is-routing" : ""}`}>
      <MapContainer center={start} zoom={15} zoomControl={false} scrollWheelZoom={true} attributionControl={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapController routeCoords={roadCoordinates} />
        <CircleMarker center={start} radius={8} pathOptions={{ color: "#ffffff", weight: 4, fillColor: "#91a795", fillOpacity: 1 }}>
          <Popup><strong>Your Location</strong></Popup>
        </CircleMarker>
        {stations.map((station) => (
          <Marker key={station.id} position={[station.lat, station.lng]} icon={stationIcon(station, selectedId === station.id)} eventHandlers={{ click: () => onSelect(station.id) }}>
            <Popup>
              <div className="station-popup">
                <strong>{station.name}</strong>
                <span>{station.available} of {station.plugs} plugs available</span>
                <span>{station.power} kW · ${station.price.toFixed(2)}/kWh</span>
                <button onClick={() => onSelect(station.id)}>View station</button>
              </div>
            </Popup>
          </Marker>
        ))}
        {routeMode && roadCoordinates.length > 0 && (
          <>
            <Polyline positions={roadCoordinates} pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
            <Polyline positions={roadCoordinates} pathOptions={{ color: "#58715d", weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
