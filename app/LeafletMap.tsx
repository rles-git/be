
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
 * Determine availability using individual charger statuses.
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

  // Use charger records as the source of truth when available.
  if (chargers.length > 0) {
    return chargers.filter((charger) =>
      isAvailableStatus(charger.status)
    ).length;
  }

  // Fallback while charger records have not loaded.
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
  onRequestLocation,
}: {
  routeMode: boolean;
  userLocation: [number, number] | null;
  onRequestLocation?: () => void;
}) {
  const map = useMap();
  const userLocationRef = useRef(userLocation);
  const lastGpsLocation = useRef<[number, number] | null>(null);

  // Keep the latest location without automatically recentering
  // whenever the GPS position changes.
  userLocationRef.current = userLocation;

  // Initialize the map on the first known GPS location only.
  useEffect(() => {
    if (!userLocation || routeMode) return;

    if (!lastGpsLocation.current) {
      map.flyTo(userLocation, 15, { duration: 0.7 });
    }

    lastGpsLocation.current = userLocation;
  }, [map, userLocation, routeMode]);

  useEffect(() => {
    const locate = () => {
      const latestLocation = userLocationRef.current;

      if (latestLocation) {
        map.flyTo(latestLocation, 15, {
          animate: true,
          duration: 0.7,
        });
      } else {
        onRequestLocation?.();
      }
    };

    const locationUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        lat: number;
        lng: number;
      }>;

      const { lat, lng } = customEvent.detail ?? {};

      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return;
      }

      // Recenter only after an explicit location update.
      map.flyTo([lat, lng], 15, {
        animate: true,
        duration: 0.7,
      });
    };

    const refreshMapSize = () => {
      window.setTimeout(() => {
        map.invalidateSize({ pan: false, animate: false });
      }, 100);
    };

    window.addEventListener("be-electric-locate", locate);
    window.addEventListener(
      "be-electric-location-updated",
      locationUpdated
    );
    window.addEventListener(
      "be-electric-map-visible",
      refreshMapSize
    );

    return () => {
      window.removeEventListener("be-electric-locate", locate);
      window.removeEventListener(
        "be-electric-location-updated",
        locationUpdated
      );
      window.removeEventListener(
        "be-electric-map-visible",
        refreshMapSize
      );
    };
  }, [map, onRequestLocation]);

  // Refresh the map dimensions when the route mode changes.
  // This does not change the map's center or zoom.
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

  // Fetch the driving route without automatically fitting the map.
  useEffect(() => {
    if (
      !routeMode ||
      !userLocation ||
      selectedLat == null ||
      selectedLng == null
    ) {
      setRoadCoordinates([]);
      return;
    }

    const controller = new AbortController();
    const routeOrigin = userLocation;

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

    void fetchDrivingRoute();

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
          (stations.length > 0
            ? ([stations[0].lat, stations[0].lng] as [
                number,
                number
              ])
            : ([25.254483277668196, 51.47912950286491] as [
                number,
                number
              ]))
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
