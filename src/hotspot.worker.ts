import { adjacencyGraph } from './hotspot-spatial';
import { validateGeometry } from './geometry';
self.onmessage = (event) => {
  try {
    self.postMessage({ graph: adjacencyGraph(validateGeometry(event.data.geometry).features) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
