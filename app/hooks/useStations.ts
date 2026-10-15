
"use client";

import { useEffect, useState } from "react";

type Station = {
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

export function useStations() {
  const [stations, setStations] = useState<Station[]>([]);
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

        const data: Station[] = await response.json();

        if (!cancelled) {
          setStations(data);
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
