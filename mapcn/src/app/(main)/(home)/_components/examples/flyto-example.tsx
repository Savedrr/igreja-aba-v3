"use client";

import {
  Map,
  MapMarker,
  MapRef,
  MarkerContent,
  MarkerTooltip,
} from "@/registry/map";
import { useRef } from "react";
import { ExampleCard } from "./example-card";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";

const destination = {
  name: "New York",
  description: "United States",
  center: [-74.006, 40.7128] as [number, number],
  startCenter: [10, 50] as [number, number],
};

export function FlyToExample() {
  const mapRef = useRef<MapRef>(null);

  return (
    <ExampleCard className="aspect-square" stagger={6}>
      <Map
        center={destination.startCenter}
        zoom={0.6}
        ref={mapRef}
        projection={{ type: "globe" }}
      >
        <MapMarker
          longitude={destination.center[0]}
          latitude={destination.center[1]}
        >
          <MarkerContent>
            <div className="relative flex items-center justify-center">
              <div className="absolute size-6 animate-ping rounded-full bg-cyan-500/20" />
              <div className="size-4 rounded-full border-2 border-white bg-cyan-500 shadow-lg" />
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="text-center">
              <div className="font-medium">{destination.name}</div>
              <div className="text-background/70 text-[10px]">
                {destination.description}
              </div>
            </div>
          </MarkerTooltip>
        </MapMarker>
      </Map>
      <Button
        size="icon-sm"
        variant="secondary"
        className="absolute top-2 right-2"
        onClick={() => {
          mapRef.current?.flyTo({
            center: destination.center,
            zoom: 14,
            duration: 2500,
          });
        }}
      >
        <Navigation className="size-4" />
      </Button>
    </ExampleCard>
  );
}
