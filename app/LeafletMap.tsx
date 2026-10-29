
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

  if (chargers.length > 0) {
    return chargers.filter((charger) =>
      isAvailableStatus(charger.status)
    ).length;
  }

  return station.available ?? 0;
}

function stationIcon(station: Station, selected: boolean) {
  const available = getAvailableChargerCount(station);

  return L.divIcon({
    className: "leaflet-station-icon-wrap",
    html: `
      <div class="leaflet-station-icon ${
        selected ? "is-selected" : ""
      } ${available === 0 ? "is-offline" : ""}">
        <span class="bolt">ϟ</span>
        <span class="count">${available}</span>
        ${selected ? "<small>SELECTED</small>" : ""}
      </div>
    `,
    iconSize: selected ? [64, 62] : [50, 48],
    iconAnchor: selected ? [32, 31] : [25, 24],
  });
}

/**
 * GPS follow behavior:
 * - Start following when a route becomes active.
 * - Follow GPS updates without fitting the entire route.
 * - Keep the GPS marker above center to account for bottom panels.
 * - Pause following when the user manually pans or zooms.
 * - Never automatically resume after manual interaction.
 * - Resume following when the user explicitly presses Locate.
 * - Never pan to the route midpoint.
 */
function MapController({
  userLocation,
  routeMode,
  onRequestLocation,
}: {
  userLocation: [number, number] | null;
  routeMode: boolean;
  onRequestLocation?: () => void;
}) {
  const map = useMap();

  const userLocationRef = useRef(userLocation);
  const programmaticMoveRef = useRef(false);
  const moveGuardTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const [isFollowing, setIsFollowing] = useState(false);

  const latitude = userLocation?.[0] ?? null;
  const longitude = userLocation?.[1] ?? null;

  // Keep the latest GPS coordinates available to event handlers.
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [latitude, longitude]);

  /**
   * Calculate a map center that places the GPS marker above
   * the center of the screen, allowing room for bottom panels.
   */
  function getOffsetCenter(
    location: [number, number],
    zoom: number
  ): L.LatLng {
    const targetPoint = map.project(location, zoom);

    targetPoint.y += map.getSize().y * 0.2;

    return map.unproject(targetPoint, zoom);
  }

  /**
   * Move the map programmatically without treating the movement
   * as a manual gesture that pauses following.
   */
  function moveToUser(
    location: [number, number],
    zoom: number,
    animated: boolean
  ) {
    if (
      !Number.isFinite(location[0]) ||
      !Number.isFinite(location[1])
    ) {
      return;
    }

    const adjustedCenter = getOffsetCenter(location, zoom);

    if (moveGuardTimerRef.current !== null) {
      clearTimeout(moveGuardTimerRef.current);
      moveGuardTimerRef.current = null;
    }

    programmaticMoveRef.current = true;

    map.stop();

    map.setView(adjustedCenter, zoom, {
      animate: animated,
      duration: 0.7,
    });

    // Release the programmatic movement guard after the animation.
    moveGuardTimerRef.current = setTimeout(() => {
      programmaticMoveRef.current = false;
      moveGuardTimerRef.current = null;
    }, animated ? 900 : 100);
  }

  /**
   * Manual pan/zoom pauses following indefinitely.
   * There is deliberately no automatic resume timer.
   */
  useEffect(() => {
    const pauseFollowing = () => {
      if (!routeMode || programmaticMoveRef.current) {
        return;
      }

      setIsFollowing(false);
    };

    /**
     * The page dispatches:
     * new CustomEvent("be-electric-locate", {
     *   detail: { lat, lng }
     * })
     *
     * Also support the { location: [lat, lng] } format.
     */
    const locate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        location?: [number, number];
        lat?: number;
        lng?: number;
      }>;

      const detail = customEvent.detail;

      const location: [number, number] | null =
        detail?.location ??
        (typeof detail?.lat === "number" &&
        typeof detail?.lng === "number"
          ? [detail.lat, detail.lng]
          : userLocationRef.current);

      if (
        location &&
        Number.isFinite(location[0]) &&
        Number.isFinite(location[1])
      ) {
        // Only resume GPS following if a route is active.
        setIsFollowing(routeMode);

        moveToUser(location, Math.max(map.getZoom(), 16), true);
      } else {
        onRequestLocation?.();
      }
    };

    const refreshMapSize = () => {
      map.invalidateSize({
        pan: false,
        animate: false,
      });
    };

    map.on("dragstart", pauseFollowing);
    map.on("zoomstart", pauseFollowing);

    window.addEventListener("be-electric-locate", locate);
    window.addEventListener(
      "be-electric-map-visible",
      refreshMapSize
    );

    return () => {
      map.off("dragstart", pauseFollowing);
      map.off("zoomstart", pauseFollowing);

      window.removeEventListener("be-electric-locate", locate);
      window.removeEventListener(
        "be-electric-map-visible",
        refreshMapSize
      );

      if (moveGuardTimerRef.current !== null) {
        clearTimeout(moveGuardTimerRef.current);
        moveGuardTimerRef.current = null;
      }
    };
  }, [map, routeMode, onRequestLocation]);

  // Start following when a route becomes active.
  // Stop following when the route is no longer active.
  useEffect(() => {
    setIsFollowing(routeMode);
  }, [routeMode]);

  // Follow GPS updates only while route mode and following are active.
  useEffect(() => {
    if (
      !routeMode ||
      !isFollowing ||
      latitude === null ||
      longitude === null
    ) {
      return;
    }

    const currentZoom = map.getZoom();
    const zoom = Math.max(currentZoom, 16);

    moveToUser([latitude, longitude], zoom, true);
  }, [
    map,
    routeMode,
    isFollowing,
    latitude,
    longitude,
  ]);

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

  // Calculate the driving route without fitting or moving the map.
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
            distance: `${(
              route.distance / 1000
            ).toFixed(1)} km`,
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

  const initialCenter: [number, number] =
    userLocation ??
    (stations.length > 0
      ? [stations[0].lat, stations[0].lng]
      : [25.254483277668196, 51.47912950286491]);

  return (
    <div
      className={`leaflet-map-root ${
        routeMode ? "is-routing" : ""
      }`}
    >
      <MapContainer
        center={initialCenter}
        zoom={userLocation ? 15 : 12}
        zoomControl={false}
        scrollWheelZoom={true}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapController
          userLocation={userLocation}
          routeMode={routeMode}
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
            <Popup autoPan={false}>
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
              <Popup autoPan={false}>
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
