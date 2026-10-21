
"use client";

import { useEffect, useState } from "react";

export type DatabaseConnector = {
  id: string | number;
  charger_id: string | number;
  connector_number: number;
  connector_type: string;
  max_power_kw: number | null;
  status: string;
};

export type DatabaseCharger = {
  id: string | number;
  station_id: string | number;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  max_power_kw: number | null;
  status: string;
  protocol: string | null;
  protocol_identity: string | null;
  connectors: DatabaseConnector[];
};

export type DatabaseStation = {
  id: string | number;
  name: string;
  shortName: string;
  address: string | null;
  lat: number;
  lng: number;
  chargerCount?: number | null;
  available: number | null;
  power: number | null;
  price: number | null;
  kind: "DC fast" | "AC";
  distance: string | null;
  minutes: number | null;
  chargers?: DatabaseCharger[] || null;
};

export type MapConnector = {
  id: string;
  charger_id: string;
  connector_number: number;
  connector_type: string;
  max_power_kw: number | null;
  status: string;
};

export type MapCharger = {
  id: string;
  station_id: string;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  max_power_kw: number | null;
  status: string;
  protocol: string | null;
  protocol_identity: string | null;
  connectors: MapConnector[];
};


export type MapStation = {
  id: string;
  name: string;
  shortName: string;
  address: string;
  lat: number;
  lng: number;
  chargerCount: station.chargerCount ?? null,
  available: number | null;
  power: number | null;
  price: number | null;
  kind: "DC fast" | "AC";
  distance: string;
  minutes: number;
  status: string;
  operator: string | null;
  chargers: MapCharger[] || null;
};


export const mapStations = (
  rows: DatabaseStation[]
): MapStation[] =>
  rows.map((station) => ({
    id: String(station.id),
    name: station.name,
    shortName: station.shortName || station.name,
    address: station.address ?? "Address unavailable",
    lat: Number(station.lat),
    lng: Number(station.lng),
    chargerCount: station.chargers,
    available: station.available,
    power: station.power,
    price: station.price,
    kind: station.kind,
    distance: station.distance ?? "",
    minutes: station.minutes ?? 0,
    status:
      station.available === 0
        ? "offline"
        : station.available != null && station.available > 0
          ? "online"
          : "unknown",
    operator: null,

    // Preserve chargers and connectors returned by the API.
    chargers: (station.chargers ?? []).map((charger) => ({
      id: String(charger.id),
      station_id: String(charger.station_id),
      name: charger.name,
      manufacturer: charger.manufacturer,
      model: charger.model,
      serial_number: charger.serial_number,
      max_power_kw: charger.max_power_kw,
      status: charger.status,
      protocol: charger.protocol,
      protocol_identity: charger.protocol_identity,

      connectors: (charger.connectors ?? []).map((connector) => ({
        id: String(connector.id),
        charger_id: String(connector.charger_id),
        connector_number: connector.connector_number,
        connector_type: connector.connector_type,
        max_power_kw: connector.max_power_kw,
        status: connector.status,
      })),
    })),
  }));

export function useStations() {
  const [stations, setStations] = useState<MapStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


useEffect(() => {
  let cancelled = false;
  let isFirstLoad = true;

  async function loadStations() {
    try {
      const response = await fetch("/api/stations", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load stations");
      }

      const data: DatabaseStation[] = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Invalid stations response");
      }

      if (!cancelled) {
        setStations(mapStations(data));
        setError(null);
      }
    } catch (err) {
      console.error("Failed to load stations:", err);

      if (!cancelled) {
        setError("Unable to load charging stations.");
      }
    } finally {
      if (!cancelled && isFirstLoad) {
        setLoading(false);
        isFirstLoad = false;
      }
    }
  }

  loadStations();

  const intervalId = window.setInterval(() => {
    loadStations();
  }, 5000);

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}, []);


  return { stations, loading, error };
}
