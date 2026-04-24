import {
  AnalyticsExample,
  DeliveryExample,
  TrendingExample,
  EVChargingExample,
  TrailExample,
} from "./examples/index";
import { FlyToExample } from "./examples/flyto-example";

export function ExamplesGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <AnalyticsExample />
      <TrailExample />
      <FlyToExample />
      <EVChargingExample />
      <TrendingExample />
      <DeliveryExample />
    </div>
  );
}
