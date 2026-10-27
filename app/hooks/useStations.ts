
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
  connectors?: DatabaseConnector[] | null;
};

export type DatabaseStation = {
  id: string | number;
  name: string;
  shortName?: string | null;
  short_name?: string | null;
  address: string | null;
  lat: number;
  lng: number;
  available?: number | null;
  power: number | null;
  price: number | null;
  kind: "DC fast" | "AC";
  distance: string | null;
  minutes: number | null;
  chargers?: DatabaseCharger[] | null;
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
  available: number;
  power: number | null;
  price: number | null;
  kind: "DC fast" | "AC";
  distance: string;
  minutes: number;
  status: string;
  operator: string | null;
  chargers: MapCharger[];
};

const normalizeStatus = (status: unknown): string =>
  String(status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const IN_USE_STATUSES = [
  "charging",
  "in_use",
  "occupied",
  "preparing",
  "reserved",
  "starting",
  "suspended_ev",
  "suspended_evse",
  "finishing",
];

const UNAVAILABLE_STATUSES = [
  "fault",
  "faulted",
  "error",
  "offline",
  "unavailable",
  "disabled",
  "out_of_order",
  "maintenance",
];

const AVAILABLE_STATUSES = [
  "available",
  "online",
  "idle",
  "ready",
];

function isConnectorAvailable(connector: MapConnector): boolean {
  const status = normalizeStatus(connector.status);

  if (UNAVAILABLE_STATUSES.includes(status)) return false;
  if (IN_USE_STATUSES.includes(status)) return false;

  return AVAILABLE_STATUSES.includes(status);
}

/**
 * Determine the charger state from its connectors.
 *
 * - All connectors in use => charging
 * - At least one usable connector => available
 * - No usable connectors and at least one fault/offline => faulted/offline
 * - Otherwise preserve the existing charger status
 */
function getEffectiveChargerStatus(charger: MapCharger): string {
  const connectors = charger.connectors ?? [];

  if (connectors.length === 0) {
    return normalizeStatus(charger.status) || "unknown";
  }

  const availableConnectors = connectors.filter(
    isConnectorAvailable
  ).length;

  const inUseConnectors = connectors.filter((connector) =>
    IN_USE_STATUSES.includes(normalizeStatus(connector.status))
  ).length;

  const unavailableConnectors = connectors.filter((connector) =>
    UNAVAILABLE_STATUSES.includes(normalizeStatus(connector.status))
  ).length;

  if (availableConnectors > 0) {
    return "available";
  }

  if (inUseConnectors === connectors.length) {
    return "charging";
  }

  if (unavailableConnectors > 0) {
    return "faulted";
  }

  return normalizeStatus(charger.status) || "unknown";
}

export const mapStations = (
  rows: DatabaseStation[]
): MapStation[] =>
  rows.map((station) => {
    const chargers: MapCharger[] = (station.chargers ?? []).map(
      (charger) => ({
        id: String(charger.id),
        station_id: String(charger.station_id),
        name: charger.name,
        manufacturer: charger.manufacturer,
        model: charger.model,
        serial_number: charger.serial_number,
        max_power_kw: charger.max_power_kw,
        status: normalizeStatus(charger.status) || "unknown",
        protocol: charger.protocol,
        protocol_identity: charger.protocol_identity,
        connectors: (charger.connectors ?? []).map((connector) => ({
          id: String(connector.id),
          charger_id: String(connector.charger_id),
          connector_number: connector.connector_number,
          connector_type: connector.connector_type,
          max_power_kw: connector.max_power_kw,
          status: normalizeStatus(connector.status) || "unknown",
        })),
      })
    );

    // Derive availability from connectors, not the possibly stale
    // station.available value or chargers.status value.
    const available = chargers.filter((charger) => {
      const effectiveStatus = getEffectiveChargerStatus(charger);
      return effectiveStatus === "available";
    }).length;

    // Keep the effective status available to all UI components.
    const chargersWithEffectiveStatus = chargers.map((charger) => ({
      ...charger,
      status: getEffectiveChargerStatus(charger),
    }));

    return {
      id: String(station.id),
      name: station.name,
      shortName:
        station.shortName || station.short_name || station.name,
      address: station.address ?? "Address unavailable",
      lat: Number(station.lat),
      lng: Number(station.lng),
      available,
      power: station.power,
      price: station.price,
      kind: station.kind,
      distance: station.distance ?? "",
      minutes: station.minutes ?? 0,
      status:
        chargers.length === 0
          ? "unknown"
          : available === 0
            ? chargersWithEffectiveStatus.every((charger) =>
                ["charging", "in_use"].includes(charger.status)
              )
              ? "in_use"
              : "unavailable"
            : "online",
      operator: null,
      chargers: chargersWithEffectiveStatus,
    };
  });

export function useStations() {
  const [stations, setStations] = useState<MapStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

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
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStations();

    const intervalId = window.setInterval(loadStations, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return { stations, loading, error };
}
