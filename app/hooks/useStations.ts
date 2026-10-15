
"use client";

import { useEffect, useState } from "react";


export type ChargerStall = {
  id: number;
  stall_number: string;
  connector_type: string;
  power_kw: number;
  status: string;
};

export type DatabaseStation = {
  id: number | string;
  name: string;
  shortName: string;
  address: string;
  lat: number | string;
  lng: number | string;
  plugs: number;
  available: number;
  power: number | string;
  price: number | string;
  kind: string;
  distance: string;
  minutes: number;
  chargers: ChargerStall[];
  availableStalls: number | string;
  totalStalls: number | string;
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
    id: String(station.id),
    name: station.name,
    shortName: station.shortName || station.name,
    address: station.address ?? "Address unavailable",
    lat: Number(station.lat),
    lng: Number(station.lng),
    plugs: station.plugs,
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
