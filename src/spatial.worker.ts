import { moran, type SpatialInput } from './moran';
self.onmessage = (e: MessageEvent<{ input: SpatialInput; permutations: number; seed: number }>) => {
  try {
    self.postMessage({ result: moran(e.data.input, e.data.permutations, e.data.seed) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
