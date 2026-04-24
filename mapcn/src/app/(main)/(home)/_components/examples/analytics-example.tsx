"use client";

import { Map, MapMarker, MarkerContent, MarkerTooltip } from "@/registry/map";
import { TrendingUp } from "lucide-react";
import { ExampleCard } from "./example-card";

const analyticsData = [
  { lng: -74.006, lat: 40.7128, city: "New York", users: 847, size: 14 },
  { lng: -0.1276, lat: 51.5074, city: "London", users: 623, size: 12 },
  { lng: 139.6917, lat: 35.6895, city: "Tokyo", users: 412, size: 10 },
  { lng: -122.4194, lat: 37.7749, city: "San Francisco", users: 298, size: 9 },
  { lng: 2.3522, lat: 48.8566, city: "Paris", users: 187, size: 8 },
  { lng: 77.209, lat: 28.6139, city: "Delhi", users: 156, size: 7 },
  { lng: 151.2093, lat: -33.8688, city: "Sydney", users: 134, size: 7 },
  { lng: -43.1729, lat: -22.9068, city: "Rio", users: 89, size: 6 },
  { lng: 4.9041, lat: 52.3676, city: "Amsterdam", users: 76, size: 5 },
  { lng: 126.978, lat: 37.5665, city: "Seoul", users: 45, size: 5 },
];

export function AnalyticsExample() {
  return (
    <ExampleCard
      className="aspect-square sm:col-span-2 sm:aspect-video lg:aspect-auto"
      stagger={4}
    >
      <div className="bg-background/95 border-border/50 absolute top-3 left-3 z-10 rounded-lg border p-3 shadow-lg backdrop-blur-md">
        <div className="text-muted-foreground mb-1 text-[10px] tracking-wider uppercase">
          Active Users
        </div>
        <div className="text-2xl leading-tight font-semibold">2,847</div>
        <div className="mt-1 flex items-center gap-1">
          <TrendingUp className="size-3 text-emerald-500" />
          <span className="text-xs text-emerald-500">+12.5%</span>
          <span className="text-muted-foreground text-xs">vs last hour</span>
        </div>
      </div>

      <Map center={[0, 30]}>
        {analyticsData.map((loc) => (
          <MapMarker key={loc.city} longitude={loc.lng} latitude={loc.lat}>
            <MarkerContent>
              <div className="relative flex items-center justify-center">
                <div
                  className="absolute rounded-full bg-emerald-500/20"
                  style={{
                    width: loc.size * 2.5,
                    height: loc.size * 2.5,
                  }}
                />
                <div
                  className="absolute animate-ping rounded-full bg-emerald-500/40"
                  style={{
                    width: loc.size * 1.5,
                    height: loc.size * 1.5,
                    animationDuration: "2s",
                  }}
                />
                <div
                  className="relative rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50"
                  style={{ width: loc.size, height: loc.size }}
                />
              </div>
            </MarkerContent>
            <MarkerTooltip>
              <div className="text-center">
                <div className="font-medium">{loc.city}</div>
                <div className="font-semibold text-emerald-500">
                  {loc.users}
                </div>
                <div className="text-background/70 text-[10px]">
                  active users
                </div>
              </div>
            </MarkerTooltip>
          </MapMarker>
        ))}
      </Map>
    </ExampleCard>
  );
}
