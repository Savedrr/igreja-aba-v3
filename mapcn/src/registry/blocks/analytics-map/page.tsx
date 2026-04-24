"use client";

import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
} from "@/registry/map";
import { OverviewCard } from "./components/overview-card";
import { BreakdownCard } from "./components/breakdown-card";
import {
  locations,
  visitedPagesRows,
  countriesRows,
  referrersRows,
  browsersRows,
} from "./data";

const MAP_HEIGHT = "38rem";

export default function Page() {
  return (
    <div
      className="bg-background relative min-h-screen"
      style={{ "--map-height": MAP_HEIGHT } as React.CSSProperties}
    >
      <div className="relative h-(--map-height)">
        <Map
          center={[-2, 16]}
          zoom={1.5}
          scrollZoom={false}
          renderWorldCopies={true}
        >
          <MapControls showFullscreen />
          {locations.map((location) => (
            <MapMarker
              key={location.city}
              longitude={location.lng}
              latitude={location.lat}
            >
              <MarkerContent>
                <div
                  className="rounded-full bg-blue-500/70"
                  style={{
                    width: location.size * 3,
                    height: location.size * 3,
                  }}
                />
              </MarkerContent>
              <MarkerTooltip
                offset={20}
                className="bg-background text-foreground border"
              >
                <p className="text-muted-foreground font-medium">
                  {location.city}
                </p>
                <p className="mt-0.5">{location.size} active users</p>
              </MarkerTooltip>
            </MapMarker>
          ))}
        </Map>
        <div
          className="via-background/30 to-background pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent"
          aria-hidden
        />
        <OverviewCard />
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <BreakdownCard title="Visited pages" rows={visitedPagesRows} />
        <BreakdownCard title="Referrers" rows={referrersRows} />
        <BreakdownCard title="Countries" rows={countriesRows} />
        <BreakdownCard title="Browsers" rows={browsersRows} />
      </div>
    </div>
  );
}
