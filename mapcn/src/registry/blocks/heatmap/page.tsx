"use client";

import { useEffect, useId } from "react";

import { Map, useMap } from "@/registry/map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EARTHQUAKE_GEOJSON_URL =
  "https://maplibre.org/maplibre-gl-js/docs/assets/earthquakes.geojson";

const HEATMAP_GRADIENT_COLORS = [
  "#fff7bc",
  "#fee391",
  "#fec44f",
  "#fe9929",
  "#d7301f",
];

const HEATMAP_COLOR_STOPS: [number, string][] = [
  [0.15, HEATMAP_GRADIENT_COLORS[0]],
  [0.35, HEATMAP_GRADIENT_COLORS[1]],
  [0.55, HEATMAP_GRADIENT_COLORS[2]],
  [0.75, HEATMAP_GRADIENT_COLORS[3]],
  [1, HEATMAP_GRADIENT_COLORS[4]],
];

function GlobeHeatmapLayers() {
  const { map, isLoaded } = useMap();
  const id = useId();
  const sourceId = `heatmap-source-${id}`;
  const heatLayerId = `heatmap-layer-${id}`;
  const pointLayerId = `heatmap-point-layer-${id}`;

  useEffect(() => {
    if (!map || !isLoaded) return;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: EARTHQUAKE_GEOJSON_URL,
      });
    }

    if (!map.getLayer(heatLayerId)) {
      map.addLayer({
        id: heatLayerId,
        type: "heatmap",
        source: sourceId,
        maxzoom: 6,
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "mag"],
            0,
            0,
            6,
            0.8,
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.55,
            6,
            1.25,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(59, 130, 246, 0)",
            ...HEATMAP_COLOR_STOPS.flat(),
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 6, 34],
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4.5,
            0.75,
            6.5,
            0.08,
          ],
        },
      });
    }

    if (!map.getLayer(pointLayerId)) {
      map.addLayer({
        id: pointLayerId,
        type: "circle",
        source: sourceId,
        minzoom: 4.5,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "mag"],
            1,
            3,
            6,
            10,
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "mag"],
            1,
            HEATMAP_GRADIENT_COLORS[1],
            2.5,
            HEATMAP_GRADIENT_COLORS[2],
            4,
            HEATMAP_GRADIENT_COLORS[3],
            6,
            HEATMAP_GRADIENT_COLORS[4],
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.8)",
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4.5,
            0,
            6.5,
            0.7,
          ],
        },
      });
    }

    return () => {
      try {
        if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId);
        if (map.getLayer(heatLayerId)) map.removeLayer(heatLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // ignore
      }
    };
  }, [map, isLoaded, sourceId, heatLayerId, pointLayerId]);

  return null;
}

export default function Page() {
  return (
    <div className="bg-muted/50 relative h-screen">
      <div className="relative h-full">
        <Map
          center={[-113, 43]}
          zoom={3.2}
          projection={{ type: "globe" }}
          pitch={24}
          minZoom={1.2}
          maxZoom={8}
        >
          <GlobeHeatmapLayers />
        </Map>
      </div>

      <Card className="absolute top-4 left-4 z-10 w-72">
        <CardHeader>
          <CardTitle>Global Earthquakes Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-1.5">
            {HEATMAP_GRADIENT_COLORS.map((color) => (
              <span
                key={color}
                className="h-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="text-muted-foreground flex items-center justify-between pt-3 text-xs">
            <span>Low</span>
            <span>High</span>
          </div>
          <p className="text-muted-foreground pt-2 text-xs">
            Data source:{" "}
            <a
              href={EARTHQUAKE_GEOJSON_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-4 transition-colors"
            >
              MapLibre earthquakes.geojson
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
