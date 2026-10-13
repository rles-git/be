"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Station = {
  id: number; name: string; shortName: string; address: string; plugs: number;
  available: number; power: number; price: number; kind: "DC fast" | "AC";
  lat: number; lng: number; distance: string; minutes: number;
};

type Props = { stations: Station[]; selectedId: number; routeMode: boolean; onSelect: (id: number) => void };
const start: [number, number] = [25.2867, 51.5333];

function stationIcon(station: Station, selected: boolean) {
  return L.divIcon({
    className: "leaflet-station-icon-wrap",
    html: `<div class="leaflet-station-icon ${selected ? "is-selected" : ""} ${station.available === 0 ? "is-offline" : ""}"><span class="bolt">ϟ</span><span class="count">${station.available}</span>${selected ? '<small>SELECTED</small>' : ""}</div>`,
    iconSize: selected ? [64, 62] : [50, 48],
    iconAnchor: selected ? [32, 31] : [25, 24],
  });
}

function MapEvents() {
  const map = useMap();
  useEffect(() => {
    const locate = () => map.flyTo(start, 15, { duration: 0.7 });
    window.addEventListener("be-electric-locate", locate);
    return () => window.removeEventListener("be-electric-locate", locate);
  }, [map]);
  return null;
}

export default function LeafletMap({ stations, selectedId, routeMode, onSelect }: Props) {
  const selected = stations.find((station) => station.id === selectedId);
  const route: [number, number][] = selected ? [start, [25.2867, 51.5333], [selected.lat, selected.lng]] : [start];

  return (
    <div className="leaflet-map-root">
      <MapContainer
          center={[25.2867, 51.5333]}
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
        <MapEvents />
        <CircleMarker center={start} radius={8} pathOptions={{ color: "#ffffff", weight: 4, fillColor: "#91a795", fillOpacity: 1 }}>
          <Popup><strong>Your starting point</strong><br />Doha, Qatar</Popup>
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
        {routeMode && selected && <Polyline positions={route} pathOptions={{ color: "#8fa795", weight: 7, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />}
      </MapContainer>
    </div>
  );
}
