/// <reference lib="webworker" />
import { runMonteCarlo, type MonteCarloOptions } from "./monteCarlo";
import type { SimInputs } from "@/data/types";

export interface MCRequest {
  inputs: SimInputs;
  opts: MonteCarloOptions;
  gridLimitMW: number;
}

// Run the (potentially heavy) Monte Carlo off the main thread so dragging
// sliders / large run counts never freeze the UI.
self.onmessage = (e: MessageEvent<MCRequest>) => {
  const { inputs, opts, gridLimitMW } = e.data;
  const result = runMonteCarlo(inputs, opts, { gridLimitMW });
  (self as unknown as Worker).postMessage(result);
};
