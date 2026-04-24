"use client";

import { Map, MapMarker, MarkerContent, MarkerTooltip } from "@/registry/map";
import { Flame, TrendingUp } from "lucide-react";
import { ExampleCard } from "./example-card";

export function TrendingExample() {
  return (
    <ExampleCard className="aspect-square" stagger={8}>
      <Map center={[-73.99, 40.735]} zoom={10}>
        <MapMarker longitude={-73.9857} latitude={40.7484}>
          <MarkerContent>
            <div className="relative flex items-center justify-center">
              <div className="pointer-events-none absolute size-18 rounded-full bg-orange-500/30" />
              <div className="absolute size-7 rounded-full bg-orange-500/40" />
              <div className="rounded-full bg-linear-to-br from-orange-500 to-red-500 p-1.5 shadow-lg shadow-orange-500/50">
                <Flame className="size-3.5 text-white" />
              </div>
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <p className="font-medium">Times Square</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="size-3 text-green-500" />
              <span className="text-xs text-green-500">2.4k visitors</span>
            </div>
          </MarkerTooltip>
        </MapMarker>
        <MapMarker longitude={-73.9654} latitude={40.7829}>
          <MarkerContent>
            <div className="relative flex items-center justify-center">
              <div className="pointer-events-none absolute size-14 rounded-full bg-rose-500/30" />
              <div className="rounded-full bg-linear-to-br from-rose-500 to-pink-500 p-1.5 shadow-lg shadow-rose-500/50">
                <Flame className="size-3 text-white" />
              </div>
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <p className="font-medium">Central Park</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="size-3 text-green-500" />
              <span className="text-xs text-green-500">1.8k visitors</span>
            </div>
          </MarkerTooltip>
        </MapMarker>
        <MapMarker longitude={-74.0445} latitude={40.6892}>
          <MarkerContent>
            <div className="relative flex items-center justify-center">
              <div className="pointer-events-none absolute size-12 rounded-full bg-amber-500/30" />
              <div className="rounded-full bg-linear-to-br from-amber-500 to-yellow-500 p-1 shadow-lg shadow-amber-500/50">
                <Flame className="size-2.5 text-white" />
              </div>
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <p className="font-medium">Statue of Liberty</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="size-3 text-green-500" />
              <span className="text-xs text-green-500">890 visitors</span>
            </div>
          </MarkerTooltip>
        </MapMarker>
      </Map>
    </ExampleCard>
  );
}
