
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
      } ${
        available === 0 ? "is-offline" : ""
      }">
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
 * Map movement is limited to an explicit Locate Me action.
 * GPS updates, route calculations, and route-mode changes
 * do not automatically move or zoom the map.
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
  const routeModeRef = useRef(routeMode);
  const followEnabledRef = useRef(true);
  const inactivityTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Always keep the latest GPS coordinates available to the timer.
  userLocationRef.current = userLocation;
  routeModeRef.current = routeMode;

  useEffect(() => {
    const clearFollowTimer = () => {
      if (inactivityTimerRef.current !== null) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };

    const centerOnLatestGPS = (animate = true) => {
      const location = userLocationRef.current;

      if (!location) return;

      if (animate) {
        map.panTo(location, {
          animate: true,
          duration: 0.5,
        });
      } else {
        map.panTo(location, {
          animate: false,
        });
      }
    };

    // Called whenever the user moves, zooms, or touches the map.
    const pauseFollowing = () => {
      if (!routeModeRef.current) return;

      followEnabledRef.current = false;
      clearFollowTimer();

      inactivityTimerRef.current = setTimeout(() => {
        inactivityTimerRef.current = null;

        // Routing may have ended while the timer was running.
        if (!routeModeRef.current) return;

        // Resume following and use the newest GPS position,
        // not the coordinates from when the timer was started.
        followEnabledRef.current = true;
        centerOnLatestGPS(true);
      }, 5000);
    };

    const container = map.getContainer();

    container.addEventListener("wheel", pauseFollowing, {
      passive: true,
    });
    container.addEventListener("touchstart", pauseFollowing, {
      passive: true,
    });
    container.addEventListener("touchmove", pauseFollowing, {
      passive: true,
    });
    container.addEventListener("dblclick", pauseFollowing);

    map.on("dragstart", pauseFollowing);
    map.on("drag", pauseFollowing);

    const locate = () => {
      const location = userLocationRef.current;

      if (location) {
        clearFollowTimer();
        followEnabledRef.current = true;

        map.flyTo(location, 15, {
          animate: true,
          duration: 0.7,
        });
      } else {
        onRequestLocation?.();
      }
    };

    const panToStation = (event: Event) => {
      const customEvent = event as CustomEvent<{
        lat: number;
        lng: number;
      }>;

      const lat = Number(customEvent.detail?.lat);
      const lng = Number(customEvent.detail?.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), {
        animate: true,
        duration: 0.7,
      });
    };

    const refreshMapSize = () => {
      map.invalidateSize({
        pan: false,
        animate: false,
      });
    };

    window.addEventListener("be-electric-locate", locate);
    window.addEventListener(
      "be-electric-pan-to-station",
      panToStation
    );
    window.addEventListener(
      "be-electric-map-visible",
      refreshMapSize
    );

    return () => {
      clearFollowTimer();

      container.removeEventListener("wheel", pauseFollowing);
      container.removeEventListener(
        "touchstart",
        pauseFollowing
      );
      container.removeEventListener(
        "touchmove",
        pauseFollowing
      );
      container.removeEventListener(
        "dblclick",
        pauseFollowing
      );

      map.off("dragstart", pauseFollowing);
      map.off("drag", pauseFollowing);

      window.removeEventListener("be-electric-locate", locate);
      window.removeEventListener(
        "be-electric-pan-to-station",
        panToStation
      );
      window.removeEventListener(
        "be-electric-map-visible",
        refreshMapSize
      );
    };
  }, [map, onRequestLocation]);

  // Start following when routing is activated.
  useEffect(() => {
    if (!routeMode) {
      followEnabledRef.current = true;

      if (inactivityTimerRef.current !== null) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      return;
    }

    followEnabledRef.current = true;

    if (userLocationRef.current) {
      map.panTo(userLocationRef.current, {
        animate: false,
      });
    }
  }, [map, routeMode]);

  // GPS updates move the map only when auto-follow is enabled.
  useEffect(() => {
    if (
      !routeMode ||
      !userLocation ||
      !followEnabledRef.current
    ) {
      return;
    }

    map.panTo(userLocation, {
      animate: false,
    });
  }, [map, routeMode, userLocation]);

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

  // Fetch and draw the driving route without moving the map.
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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapController
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
