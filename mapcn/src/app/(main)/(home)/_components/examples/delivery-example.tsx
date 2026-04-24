"use client";

import { useEffect, useState } from "react";
import {
  Map,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MarkerTooltip,
  MapRoute,
} from "@/registry/map";
import { Truck } from "lucide-react";
import { ExampleCard } from "./example-card";

const store = { lng: -0.14, lat: 51.5154 };
const home = { lng: -0.07, lat: 51.51 };

export function DeliveryExample() {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [truckPosition, setTruckPosition] = useState<[number, number] | null>(
    null,
  );

  useEffect(() => {
    async function fetchRoute() {
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${store.lng},${store.lat};${home.lng},${home.lat}?overview=full&geometries=geojson`,
        );
        const data = await response.json();

        if (data.routes?.[0]?.geometry?.coordinates) {
          const coords: [number, number][] =
            data.routes[0].geometry.coordinates;
          setRoute(coords);
          const truckIdx = Math.floor(coords.length * 0.6);
          setTruckPosition(coords[truckIdx]);
        }
      } catch (error) {
        console.error("Failed to fetch route:", error);
      }
    }

    fetchRoute();
  }, []);

  return (
    <ExampleCard
      className="aspect-square sm:col-span-2 sm:aspect-video lg:aspect-auto"
      stagger={9}
    >
      <Map center={[-0.105, 51.511]} zoom={12.4}>
        {route.length > 0 && (
          <MapRoute coordinates={route} width={4} color="#4285F4" />
        )}
        <MapMarker longitude={store.lng} latitude={store.lat}>
          <MarkerContent>
            <div className="size-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-lg" />
            <MarkerLabel>Store</MarkerLabel>
          </MarkerContent>
        </MapMarker>
        {truckPosition && (
          <MapMarker longitude={truckPosition[0]} latitude={truckPosition[1]}>
            <MarkerContent>
              <div className="rounded-full bg-blue-500 p-1.5 shadow-lg">
                <Truck className="size-3 text-white" />
              </div>
            </MarkerContent>
            <MarkerTooltip>On the way</MarkerTooltip>
          </MapMarker>
        )}
        <MapMarker longitude={home.lng} latitude={home.lat}>
          <MarkerContent>
            <div className="size-3.5 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
            <MarkerLabel>Home</MarkerLabel>
          </MarkerContent>
        </MapMarker>
      </Map>
    </ExampleCard>
  );
}
