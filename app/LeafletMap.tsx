
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

function stationIcon(station: Station, selected: boolean) {
  const available = station.available ?? 0;

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
  routeCoords,
  routeMode,
  selectedId,
  userLocation,
  onRequestLocation,
}: {
  routeCoords: [number, number][];
  routeMode: boolean;
  selectedId: string;
  userLocation: [number, number] | null;
  onRequestLocation?: () => void;
}) {
  const map = useMap();
  const lastFittedRouteKey = useRef<string | null>(null);
  const lastGpsLocation = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!userLocation) return;

    // Center on the first GPS fix, but do not fight the user by recentering
    // the map every time the device reports a small location change.
    if (!lastGpsLocation.current && !routeMode) {
      map.flyTo(userLocation, 15, { duration: 0.7 });
    }
    lastGpsLocation.current = userLocation;
  }, [map, userLocation, routeMode]);

  useEffect(() => {
    const locate = () => {
      if (userLocation) {
        map.flyTo(userLocation, 15, { duration: 0.7 });
      } else {
        onRequestLocation?.();
      }
    };

    const locationUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ lat: number; lng: number }>;
      const { lat, lng } = customEvent.detail ?? {};
      if (typeof lat !== "number" || typeof lng !== "number") return;

      // GPS watch updates must not move the map while the user is viewing
      // a route. Otherwise every location update interrupts manual zooming.
      if (!routeMode) {
        map.flyTo([lat, lng], 15, { duration: 0.7 });
      }
    };

    const refreshMapSize = () => {
      window.setTimeout(() => {
        map.invalidateSize({ pan: false, animate: false });
      }, 100);
    };

    const panToStation = (event: Event) => {
      const customEvent = event as CustomEvent<{
        lat: number;
        lng: number;
      }>;

      const { lat, lng } = customEvent.detail ?? {};

      if (typeof lat !== "number" || typeof lng !== "number") {
        return;
      }

      map.flyTo([lat, lng], Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.9,
      });
    };

    window.addEventListener("be-electric-locate", locate);
    window.addEventListener("be-electric-location-updated", locationUpdated);
    window.addEventListener(
      "be-electric-map-visible",
      refreshMapSize
    );
    window.addEventListener(
      "be-electric-pan-to-station",
      panToStation
    );

    return () => {
      window.removeEventListener("be-electric-locate", locate);
      window.removeEventListener("be-electric-location-updated", locationUpdated);
      window.removeEventListener(
        "be-electric-map-visible",
        refreshMapSize
      );
      window.removeEventListener(
        "be-electric-pan-to-station",
        panToStation
      );
    };
  }, [map, userLocation, onRequestLocation, routeMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize({ pan: false, animate: false });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [map, routeMode]);

  useEffect(() => {
    // Reset only when route preview is closed. While a route is active,
    // ignore small GPS-origin changes so the map does not snap back after
    // the user manually zooms or pans.
    if (!routeMode) {
      lastFittedRouteKey.current = null;
      return;
    }

    if (routeCoords.length < 2) return;

    // Fit only once for each selected destination during a route preview.
    // Do not key this to route geometry: GPS updates can slightly change the
    // OSRM geometry and would otherwise reset the user's zoom level.
    const routeKey = selectedId;

    if (lastFittedRouteKey.current === routeKey) return;

    lastFittedRouteKey.current = routeKey;

    map.fitBounds(L.latLngBounds(routeCoords), {
      padding: [60, 60],
      animate: false,
    });
  }, [map, routeCoords, routeMode, selectedId]);

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
    // Capture the non-null GPS location so TypeScript can safely narrow it
    // inside the asynchronous route-fetch function.
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
            distance:
              `${(route.distance / 1000).toFixed(1)} km`,
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
        center={userLocation ?? ([stations[0].lat, stations[0].lng] as [number, number])}
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
          routeCoords={roadCoordinates}
          routeMode={routeMode}
          selectedId={selectedId}
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
              <strong>{isFallbackLocation ? "Default Starting Location" : "Your GPS Location"}</strong>
            </Popup>
          </CircleMarker>
        )}

        {stations.map((station) => {
          const totalChargers = station.chargers.length;
          const availableChargers = station.available ?? 0;

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

                  <span>
                    Status: {station.status}
                  </span>

                  <button
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
