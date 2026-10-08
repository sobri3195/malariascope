import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';
import {
  sensorHealth,
  districtSensorSummary,
  type Sensor,
  type Reading,
  type IoTSettings,
} from './iot-engine';
export default function IoTMap({
  sensors,
  readings,
  settings,
  layer,
  onSelect,
}: {
  sensors: Sensor[];
  readings: Reading[];
  settings: IoTSettings;
  layer: string;
  onSelect: (id: string) => void;
}) {
  const { state } = useStore();
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { attributionControl: true, zoomControl: true }).setView(
      [-2.9, 138.7],
      6,
    );
    instance.attributionControl.addAttribution(
      'geoBoundaries · CC BY 3.0 IGO · source vintage 2020',
    );
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const group = L.featureGroup().addTo(instance),
      summaries = districtSensorSummary(sensors, readings, settings);
    if (state.geometry)
      L.geoJSON(state.geometry, {
        style: (feature) => {
          const name = feature?.properties?.district || feature?.properties?.name,
            summary = summaries.find((s) => s.district === name),
            value =
              layer === 'Rainfall'
                ? summary?.rainfall
                : layer === 'Temperature'
                  ? summary?.temperature
                  : layer === 'Humidity'
                    ? summary?.humidity
                    : layer === 'Data Completeness'
                      ? summary?.completeness
                      : summary?.sensorsWithReadings;
          return {
            weight: 1,
            color: '#627783',
            fillColor: value == null ? '#dfe5e8' : '#168583',
            fillOpacity: value == null ? 0.35 : 0.65,
          };
        },
        onEachFeature: (feature, polygon) => {
          const name = feature.properties?.district || feature.properties?.name;
          const text = document.createElement('div');
          const summary = summaries.find((s) => s.district === name);
          text.textContent =
            String(name) +
            ' · ' +
            (summary
              ? `${summary.sensorsWithReadings}/${summary.sensors} sensors with accepted readings`
              : 'No sensor data');
          polygon.bindTooltip(text);
        },
      }).addTo(group);
    for (const sensor of sensors) {
      if (sensor.simulation || sensor.latitude == null || sensor.longitude == null) continue;
      const health = sensorHealth(sensor, readings, settings);
      const marker = L.circleMarker([sensor.latitude, sensor.longitude], {
        radius: 7,
        color:
          health.status === 'ONLINE'
            ? '#087f78'
            : health.status === 'OFFLINE'
              ? '#b93838'
              : '#b07b12',
        fillOpacity: 1,
      }).addTo(group);
      const popup = document.createElement('div');
      popup.textContent = `${sensor.sensor_name} · ${sensor.district} · ${health.status} · Battery ${health.battery ?? 'unavailable'} · Last seen ${health.lastSeen ?? 'unavailable'} · Latest ${health.latest ? health.latest.value + ' ' + health.latest.unit : 'unavailable'}`;
      marker.bindPopup(popup).on('click', () => onSelect(sensor.sensor_id));
    }
    const bounds = group.getBounds();
    if (bounds.isValid()) instance.fitBounds(bounds, { padding: [12, 12], maxZoom: 9 });
    return () => {
      group.remove();
    };
  }, [state.geometry, sensors, readings, settings, layer, onSelect]);
  return <div className="iot-map" ref={host} aria-label="Local environmental sensor map" />;
}
