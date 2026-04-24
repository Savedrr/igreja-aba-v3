import React from "react";
import { RegistryBlockItem } from "@/lib/blocks";

export const blockComponents: Record<
  RegistryBlockItem["name"],
  React.LazyExoticComponent<React.ComponentType<object>>
> = {
  "analytics-map": React.lazy(() => import("./analytics-map/page")),
  heatmap: React.lazy(() => import("./heatmap/page")),
  "delivery-tracker": React.lazy(() => import("./delivery-tracker/page")),
  "logistics-network": React.lazy(() => import("./logistics-network/page")),
};
