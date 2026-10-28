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
import type { MapCharger } from "@/app/hooks/useStations";

type Station = {
  lat: number;
  lng: number;
  id: string;
  name: string;
  shortName: string;
  address: string;
  chargers: MapCharger[];
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
  userLocation: [number, number] | null;
  isFallbackLocation?: boolean;
  onRequestLocation?: () => void;
  onSelect: (id: string) => void;
  onRouteCalculated?: (metrics: {
    distance: string;
    minutes: number;
  }) => void;
};

/**
 * Use individual charger statuses as the source of truth.
 * Keep this list consistent with the station details component.
 */
function isAvailableStatus(status: unknown): boolean {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();

  return ["available", "online", "idle", "ready"].includes(
    normalized
  );
}

function getAvailableChargerCount(station: Station): number {
  const chargers = Array.isArray(station.chargers)
    ? station.chargers
    : [];

  // When charger records are available, never trust the station-level
  // available count because it may be stale.
  if (chargers.length > 0) {
    return chargers.filter((charger) =>
      isAvailableStatus(charger.status)
    ).length;
  }

  // Fallback for stations whose charger records have not loaded yet.
  return station.available ?? 0;
}

function stationIcon(station: Station, selected: boolean) {
  const available = getAvailableChargerCount(station);

  return L.divIcon({
    className: "leaflet-station-icon-wrap",
    html: `
      <div class="leaflet-station-icon ${
        selected ? "is-selected" : ""
      } ${
        available === 0 ? "is-offline" : ""
      }">
        <span class="bolt">ϟ</span>
        <span class="count">${available}</span>
        ${
          selected
            ? "<small>SELECTED</small>"
            : ""
        }
      </div>
    `,
    iconSize: selected ? [64, 62] : [50, 48],
    iconAnchor: selected ? [32, 31] : [25, 24],
  });
}

function MapController({
  routeMode,
  userLocation,
  roadCoordinates,
  selectedStationId,
  onRequestLocation,
}: {
  routeMode: boolean;
  userLocation: [number, number] | null;
  roadCoordinates: [number, number][];
  selectedStationId?: string;
  onRequestLocation?: () => void;
}) {
  const map = useMap();
  const userLocationRef = useRef(userLocation);
  const lastGpsLocation = useRef<[number, number] | null>(null);
  const followGps = useRef(false);
  const previousRouteMode = useRef(routeMode);
  const routeStartCentered = useRef(false);

  userLocationRef.current = userLocation;

  // On route start, center on the user's current GPS position exactly once.
  // Do not frame the whole route; this avoids competing map animations.
  useEffect(() => {
    if (routeMode && !previousRouteMode.current) {
      followGps.current = true;
      routeStartCentered.current = false;
      const latest = userLocationRef.current;
      if (latest) {
        map.stop();
        map.setView(latest, Math.max(map.getZoom(), 16), { animate: false });
        lastGpsLocation.current = latest;
        routeStartCentered.current = true;
      } else {
        onRequestLocation?.();
      }
    } else if (!routeMode) {
      followGps.current = false;
      routeStartCentered.current = false;
    }
    previousRouteMode.current = routeMode;
  }, [map, routeMode, onRequestLocation]);

  // User interaction temporarily disables following. GPS continues updating;
  // the map will stay where the user pans until Reset Location is pressed.
  useEffect(() => {
    const pauseFollowing = () => {
      followGps.current = false;
    };
    map.on("dragstart", pauseFollowing);
    return () => {
      map.off("dragstart", pauseFollowing);
    };
  }, [map]);

  // Follow GPS without animated pans that can repeatedly interrupt a user's
  // gesture. A manual drag disables this until the explicit locate/reset event.
  useEffect(() => {
    if (!userLocation) return;

    const previous = lastGpsLocation.current;
    const changed = !previous ||
      previous[0] !== userLocation[0] ||
      previous[1] !== userLocation[1];

    if (changed && routeMode && followGps.current) {
      map.stop();
      map.panTo(userLocation, { animate: false });
    } else if (!previous && !routeMode) {
      map.setView(userLocation, 15, { animate: false });
    }

    lastGpsLocation.current = userLocation;
  }, [map, userLocation, routeMode]);

  useEffect(() => {
    const locate = () => {
      const latestLocation = userLocationRef.current;
      if (latestLocation) {
        followGps.current = true;
        lastGpsLocation.current = latestLocation;
        map.stop();
        map.setView(latestLocation, 16, { animate: false });
      } else {
        onRequestLocation?.();
      }
    };

    const locationUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ lat: number; lng: number }>;
      const { lat, lng } = customEvent.detail ?? {};
      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) return;

      const latest: [number, number] = [lat, lng];
      followGps.current = true;
      lastGpsLocation.current = latest;
      map.stop();
      map.setView(latest, 16, { animate: false });
    };

    const refreshMapSize = () => {
      window.setTimeout(() => {
        map.invalidateSize({ pan: false, animate: false });
      }, 100);
    };

    window.addEventListener("be-electric-locate", locate);
    window.addEventListener("be-electric-location-updated", locationUpdated);
    window.addEventListener("be-electric-map-visible", refreshMapSize);
    return () => {
      window.removeEventListener("be-electric-locate", locate);
      window.removeEventListener("be-electric-location-updated", locationUpdated);
      window.removeEventListener("be-electric-map-visible", refreshMapSize);
    };
  }, [map, onRequestLocation]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize({ pan: false, animate: false });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [map, routeMode]);

  return null;
}

export default function LeafletMap({
  stations,
  selectedId,
  routeMode,
  userLocation,
  isFallbackLocation = false,
  onRequestLocation,
  onSelect,
  onRouteCalculated,
}: Props) {
  const selected = stations.find(
    (station) => station.id === selectedId
  );

  const [roadCoordinates, setRoadCoordinates] = useState<
    [number, number][]
  >([]);

  const onRouteCalculatedRef = useRef(onRouteCalculated);

  useEffect(() => {
    onRouteCalculatedRef.current = onRouteCalculated;
  }, [onRouteCalculated]);

  const selectedLat = selected?.lat;
  const selectedLng = selected?.lng;
  const selectedStationId = selected?.id;
  const routeOriginRef = useRef<[number, number] | null>(userLocation);
  const previousRouteForOrigin = useRef(routeMode);
  const lastRequestedRouteKey = useRef<string | null>(null);

  useEffect(() => {
    if (routeMode && !previousRouteForOrigin.current && userLocation) {
      routeOriginRef.current = userLocation;
    } else if (!routeMode) {
      routeOriginRef.current = userLocation;
    }
    previousRouteForOrigin.current = routeMode;
  }, [routeMode, userLocation]);

  useEffect(() => {
    if (!routeMode) {
      setRoadCoordinates([]);
      lastRequestedRouteKey.current = null;
      return;
    }
    if (!userLocation || selectedLat == null || selectedLng == null) return;

    const routeKey = `${selectedStationId}:${selectedLat}:${selectedLng}`;
    if (lastRequestedRouteKey.current === routeKey) return;
    lastRequestedRouteKey.current = routeKey;

    const controller = new AbortController();
    const routeOrigin = routeOriginRef.current ?? userLocation;

    async function fetchDrivingRoute() {
      try {
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${routeOrigin[1]},${routeOrigin[0]};${selectedLng},${selectedLat}` +
          `?overview=full&geometries=geojson`;

        const response = await fetch(url, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Route request failed: ${response.status}`
          );
        }

        const data = await response.json();

        if (data.code === "Ok" && data.routes?.[0]) {
          const route = data.routes[0];

          const latLngs: [number, number][] =
            route.geometry.coordinates.map(
              ([lng, lat]: [number, number]) =>
                [lat, lng] as [number, number]
            );

          setRoadCoordinates(latLngs);

          onRouteCalculatedRef.current?.({
            distance: `${(route.distance / 1000).toFixed(1)} km`,
            minutes: Math.max(
              1,
              Math.round(route.duration / 60)
            ),
          });
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          console.error(
            "Failed to fetch road network route:",
            err
          );
        }
      }
    }

    fetchDrivingRoute();

    return () => controller.abort();
  }, [
    routeMode,
    selectedStationId,
    selectedLat,
    selectedLng,
    userLocation,
  ]);

  return (
    <div
      className={`leaflet-map-root ${
        routeMode ? "is-routing" : ""
      }`}
    >
      <MapContainer
        center={
          userLocation ??
          ([stations[0].lat, stations[0].lng] as [
            number,
            number
          ])
        }
        zoom={userLocation ? 15 : 12}
        zoomControl={false}
        scrollWheelZoom={true}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapController
          routeMode={routeMode}
          userLocation={userLocation}
          roadCoordinates={roadCoordinates}
          selectedStationId={selectedStationId}
          onRequestLocation={onRequestLocation}
        />

        {userLocation && (
          <CircleMarker
            center={userLocation}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              weight: 4,
              fillColor: "#91a795",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>
                {isFallbackLocation
                  ? "Default Starting Location"
                  : "Your GPS Location"}
              </strong>
            </Popup>
          </CircleMarker>
        )}

        {stations.map((station) => {
          const chargers = Array.isArray(station.chargers)
            ? station.chargers
            : [];

          const totalChargers = chargers.length;
          const availableChargers =
            getAvailableChargerCount(station);

          return (
            <Marker
              key={station.id}
              position={[station.lat, station.lng]}
              icon={stationIcon(
                station,
                selectedId === station.id
              )}
              eventHandlers={{
                click: () => onSelect(station.id),
              }}
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

                  <span>
                    Total chargers: {totalChargers}
                  </span>

                  <span>
                    Available chargers: {availableChargers}
                  </span>

                  <span>Status: {station.status}</span>

                  <button
                    type="button"
                    onClick={() => onSelect(station.id)}
                  >
                    View station
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

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
