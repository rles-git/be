
"use client";

import { useEffect, useState } from "react";

export type DatabaseStation = {
  id: string;
  name: string;
  address: string | null;
  area: string | null;
  latitude: number;
  longitude: number;
  status: string;
  power_kw: number | null;
  connector_type: string | null;
  operator: string | null;
};

export type MapStation = {
  id: string;
  name: string;
  shortName: string;
  address: string;
  lat: number;
  lng: number;
  plugs: number | null;
  available: number | null;
  power: number | null;
  price: number | null;
  kind: "DC fast" | "AC";
  distance: string;
  minutes: number;
  status: string;
  operator: string | null;
};

export const mapStations = (
  rows: DatabaseStation[]
): MapStation[] =>
  rows.map((station) => ({
    id: station.id,
    name: station.name,
    shortName: station.name,
    address: station.address ?? station.area ?? "Address unavailable",
    lat: Number(station.latitude),
    lng: Number(station.longitude),
    plugs: null,
    available: null,
    power: station.power_kw,
    price: null,
    kind:
      station.connector_type?.toUpperCase().includes("CCS") ||
      station.connector_type?.toUpperCase().includes("CHADEMO")
        ? "DC fast"
        : "AC",
    distance: "",
    minutes: 0,
    status: station.status,
  }));

export function useStations() {
  const [stations, setStations] = useState<MapStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStations() {
      try {
        const response = await fetch("/api/stations");

        if (!response.ok) {
          throw new Error("Could not load stations");
        }

        const data: DatabaseStation[] = await response.json();

        if (!cancelled) {
          setStations(mapStations(data));
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load charging stations.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStations();

    return () => {
      cancelled = true;
    };
  }, []);

  return { stations, loading, error };
}
