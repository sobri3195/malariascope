import { forwardRef, useId, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map-canvas.css';
import {
  featureName,
  featureIdentity,
  matchedFeatures,
  mapColor,
  mapValue,
  valueLabel,
  type Bounds,
  type MapFeature,
} from './map-intelligence';
import { type PublicFacility } from './public-healthcare';
import { type Row } from './analytics';
export type MapCamera = { lat: number; lon: number; zoom: number };
export type MapHandle = {
  zoom: (delta: number) => void;
  reset: () => void;
  focus: (identity: string) => void;
  svg: (
    title: string,
    legend: { label: string; color: string }[],
    metadata: string,
  ) => string | null;
};
export type CanvasProps = {
  context?: 'local' | 'osm';
  geometry: any;
  administrative: boolean;
  focusSelection?: boolean;
  rows: Row[];
  year: number;
  layer: string;
  model: string;
  thresholds: number[];
  breaks: number[];
  opacity: number;
  visible: boolean;
  clusters: Record<string, string>;
  selectedIdentity: string | null;
  neighbors: string[];
  facilities: PublicFacility[];
  camera: MapCamera | null;
  onCamera: (camera: MapCamera, bounds: Bounds) => void;
  onSelect: (district: string, identity?: string) => void;
  label: string;
  reduced: boolean;
};
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
function focusIdentity(m: L.Map | null, g: L.GeoJSON | null, identity: string) {
  const bounds = L.latLngBounds([]);
  g?.eachLayer((layer) => {
    const id = featureIdentity((layer as any).feature);
    if (
      (identity === 'ID' || id === identity || id.startsWith(identity + '.')) &&
      'getBounds' in layer
    )
      bounds.extend((layer as L.Polygon).getBounds());
  });
  if (bounds.isValid()) m?.fitBounds(bounds, { padding: [35, 35], animate: false });
}
const MapCanvas = forwardRef<MapHandle, CanvasProps>(function MapCanvas(props, ref) {
  const patternId = useId().replace(/[^a-zA-Z0-9]/g, '') + '-nodata';
  const div = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    geo = useRef<L.GeoJSON | null>(null),
    markers = useRef<L.LayerGroup | null>(null),
    latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState('');
  const keyboardNodes = useRef(new WeakSet<Element>());
  useImperativeHandle(
    ref,
    () => ({
      zoom: (delta) => {
        const m = map.current;
        if (m) m.setZoom(m.getZoom() + delta, { animate: !latest.current.reduced });
      },
      reset: () => {
        if (map.current && latest.current.geometry && latest.current.administrative) {
          const bounds = L.geoJSON(latest.current.geometry).getBounds();
          if (bounds.isValid())
            map.current.fitBounds(bounds, { padding: [20, 20], animate: false });
        } else map.current?.setView([-3.2, 138.4], 6);
      },
      focus: (identity) => focusIdentity(map.current, geo.current, identity),
      svg: (title, legend, metadata) => {
        const m = map.current,
          p = latest.current;
        if (!m) return null;
        const size = m.getSize(),
          features: MapFeature[] = p.visible ? p.geometry?.features || [] : [];
        const footerHeight = Math.max(170, legend.length * 17 + 60);
        const current = p.rows.filter((r) => r.year === p.year);
        const linked = new Map(
          matchedFeatures(p.geometry?.features || [], current).map((m) => [
            featureIdentity(m.feature),
            m.row,
          ]),
        );
        const path = (f: MapFeature) => {
          const polygons =
            f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
          const d = polygons
            .flatMap((polygon) =>
              polygon.map(
                (ring: number[][]) =>
                  ring
                    .map((point, i) => {
                      const xy = m.latLngToContainerPoint([point[1], point[0]]);
                      return `${i ? 'L' : 'M'}${xy.x.toFixed(1)},${xy.y.toFixed(1)}`;
                    })
                    .join(' ') + ' Z',
              ),
            )
            .join(' ');
          const v = mapValue(
            linked.get(featureIdentity(f)),
            p.layer,
            p.rows,
            p.model,
            p.thresholds,
            p.clusters,
          );
          const id = featureIdentity(f),
            neighbor = p.neighbors.includes(id),
            selected = p.selectedIdentity === id;
          return `<path d="${d}" fill="${p.administrative && v === null && p.layer !== 'boundaries' ? 'url(#no-data)' : mapColor(p.administrative ? v : null, p.administrative ? p.layer : 'boundaries', p.breaks)}" fill-opacity="${p.opacity}" fill-rule="evenodd" stroke="${selected ? '#154b42' : neighbor ? '#4d60bf' : '#597a76'}" stroke-width="${selected ? 3 : neighbor ? 2.5 : 1}"${neighbor ? ' stroke-dasharray="5 3"' : ''}/>`;
        };
        const facilities = p.facilities
          .map((f) => {
            const xy = m.latLngToContainerPoint([f.lat, f.lon]);
            return `<circle cx="${xy.x}" cy="${xy.y}" r="4" fill="#29739b" stroke="white" stroke-width="1"><title>${esc(f.name)}</title></circle>`;
          })
          .join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.x}" height="${size.y + footerHeight}" viewBox="0 0 ${size.x} ${size.y + footerHeight}"><title>${esc(title)}</title><desc>${esc(metadata)} Basemap tiles omitted; vector administrative data only.</desc><rect width="100%" height="100%" fill="#eef3f2"/><defs><pattern id="no-data" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#edf0f2"/><path d="M0 8L8 0" stroke="#8999a4"/></pattern><clipPath id="viewport"><rect width="${size.x}" height="${size.y}"/></clipPath></defs><g clip-path="url(#viewport)">${features.map(path).join('')}${facilities}</g><rect y="${size.y}" width="100%" height="${footerHeight}" fill="white"/><text x="15" y="${size.y + 24}" font-family="sans-serif" font-size="14" fill="#213b42">${esc(title)}</text>${legend.map((item, i) => `<rect x="15" y="${size.y + 35 + i * 17}" width="9" height="9" fill="${item.color}"/><text x="31" y="${size.y + 43 + i * 17}" font-family="sans-serif" font-size="10">${esc(item.label)}</text>`).join('')}<text x="15" y="${size.y + footerHeight - 13}" font-family="sans-serif" font-size="9">MALARIASCOPE · Analytical decision support · vector export without basemap</text></svg>`;
      },
    }),
    [],
  );
  useEffect(() => {
    if (!div.current) return;
    const m = L.map(div.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView([-3.2, 138.4], 6);
    map.current = m;
    L.control.scale({ imperial: false }).addTo(m);
    const move = () => {
      const center = m.getCenter(),
        b = m.getBounds();
      latest.current.onCamera(
        { lat: center.lat, lon: center.lng, zoom: m.getZoom() },
        { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      );
    };
    m.on('moveend', move);
    m.on('resize', move);
    move();
    const resize = new ResizeObserver(() => {
      if (map.current === m) {
        m.invalidateSize({ animate: false, pan: false });
        const p = latest.current;
        if (p.focusSelection && p.administrative && p.selectedIdentity)
          focusIdentity(m, geo.current, p.selectedIdentity);
      }
    });
    resize.observe(div.current);
    return () => {
      resize.disconnect();
      map.current = null;
      m.off('moveend', move);
      m.off('resize', move);
      m.stop();
      m.remove();
    };
  }, []);
  const [onlineStatus, setOnlineStatus] = useState('ONLINE CONTEXT UNAVAILABLE');
  useEffect(() => {
    const m = map.current;
    setError('');
    if (!m || props.context !== 'osm') return;
    let failed = false;
    setOnlineStatus('ONLINE CONTEXT UNAVAILABLE');
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    })
      .on('tileerror', () => {
        failed = true;
        setOnlineStatus('ONLINE CONTEXT UNAVAILABLE');
        setError('Online basemap unavailable — analytical vector layers remain available.');
      })
      .on('tileload', () => {
        if (!failed) setOnlineStatus('ONLINE CONTEXT AVAILABLE');
      })
      .addTo(m);
    return () => {
      tiles.remove();
    };
  }, [props.context]);
  useEffect(() => {
    const m = map.current;
    if (!m || !props.camera) return;
    const c = m.getCenter(),
      next = props.camera;
    if (
      Math.abs(c.lat - next.lat) > 1e-7 ||
      Math.abs(c.lng - next.lon) > 1e-7 ||
      m.getZoom() !== next.zoom
    )
      m.setView([next.lat, next.lon], next.zoom, { animate: false });
  }, [props.camera]);
  useEffect(() => {
    const m = map.current;
    if (!m || !props.geometry) return;
    geo.current?.remove();
    geo.current = L.geoJSON(props.geometry, {
      onEachFeature: (f, layer) => {
        layer.on('click', () => {
          const p = latest.current;
          if (!p.administrative) return;
          const row = matchedFeatures(
            p.geometry?.features || [],
            p.rows.filter((r) => r.year === p.year),
          ).find((m) => featureIdentity(m.feature) === featureIdentity(f as MapFeature))?.row;
          p.onSelect(
            row?.district || featureName(f as MapFeature),
            featureIdentity(f as MapFeature),
          );
        });
      },
    }).addTo(m);
    if (props.administrative) {
      const bounds = geo.current.getBounds();
      if (bounds.isValid()) m.fitBounds(bounds, { padding: [20, 20], animate: false });
    }
    return () => {
      geo.current?.remove();
      geo.current = null;
    };
  }, [props.geometry, props.administrative]);
  useEffect(() => {
    if (props.focusSelection && props.administrative && props.selectedIdentity)
      focusIdentity(map.current, geo.current, props.selectedIdentity);
  }, [props.focusSelection, props.administrative, props.selectedIdentity, props.geometry]);
  useEffect(() => {
    const g = geo.current,
      m = map.current;
    if (!g || !m) return;
    if (props.visible) {
      if (!m.hasLayer(g)) g.addTo(m);
    } else {
      g.remove();
      return;
    }
    const linked = new Map(
      matchedFeatures(
        props.geometry?.features || [],
        props.rows.filter((r) => r.year === props.year),
      ).map((m) => [featureIdentity(m.feature), m.row]),
    );
    g.eachLayer((layer) => {
      const f = (layer as L.Polygon & { feature: MapFeature }).feature,
        id = featureIdentity(f);
      const row = linked.get(id);
      const value = props.administrative
        ? mapValue(row, props.layer, props.rows, props.model, props.thresholds, props.clusters)
        : null;
      const selected = id === props.selectedIdentity,
        neighbor = props.neighbors.includes(id);
      (layer as L.Path).setStyle({
        fillColor: mapColor(value, props.administrative ? props.layer : 'boundaries', props.breaks),
        fillOpacity: props.opacity,
        color: selected ? '#154b42' : neighbor ? '#4d60bf' : '#597a76',
        weight: selected ? 3 : neighbor ? 2.5 : 1,
        dashArray: neighbor ? '5 3' : undefined,
      });
      const el = document.createElement('div'),
        title = document.createElement('strong');
      title.textContent = row?.district || featureName(f);
      el.append(
        title,
        document.createElement('br'),
        document.createTextNode(
          `${props.year} · ${props.administrative ? valueLabel(value, props.layer) : 'Country outline; district geometry not connected'}`,
        ),
      );
      layer.unbindTooltip();
      layer.bindTooltip(el);
      const element = (layer as L.Path).getElement();
      if (element) {
        element.setAttribute('data-region-identity', id);
        if (props.administrative) {
          element.setAttribute('role', 'button');
          element.setAttribute('tabindex', '0');
          element.setAttribute(
            'aria-label',
            `${row?.district || featureName(f)} · ${id} · ${props.year}`,
          );
          element.setAttribute('aria-pressed', String(selected));
          if (!keyboardNodes.current.has(element)) {
            element.addEventListener('keydown', (event) => {
              const e = event as KeyboardEvent;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                layer.fire('click');
              }
            });
            keyboardNodes.current.add(element);
          }
        }
        const svg = (element as SVGElement).ownerSVGElement;
        if (svg && !svg.querySelector('#' + patternId)) {
          const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
          pattern.setAttribute('id', patternId);
          pattern.setAttribute('width', '8');
          pattern.setAttribute('height', '8');
          pattern.setAttribute('patternUnits', 'userSpaceOnUse');
          const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          background.setAttribute('width', '8');
          background.setAttribute('height', '8');
          background.setAttribute('fill', '#edf0f2');
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', '0');
          line.setAttribute('y1', '8');
          line.setAttribute('x2', '8');
          line.setAttribute('y2', '0');
          line.setAttribute('stroke', '#8999a4');
          pattern.append(background, line);
          defs.append(pattern);
          svg.prepend(defs);
        }
        if (props.administrative && value === null && props.layer !== 'boundaries')
          element.setAttribute('fill', `url(#${patternId})`);
        element.classList.toggle('hotspot-neighbor', neighbor);
        element.classList.toggle('hotspot-selected', selected);
      }
    });
  }, [
    patternId,
    props.geometry,
    props.administrative,
    props.rows,
    props.year,
    props.layer,
    props.model,
    props.thresholds,
    props.breaks,
    props.opacity,
    props.visible,
    props.clusters,
    props.selectedIdentity,
    props.neighbors,
  ]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current?.remove();
    markers.current = L.layerGroup();
    for (const facility of props.facilities) {
      const marker = L.circleMarker([facility.lat, facility.lon], {
        radius: 5,
        className: 'public-facility-marker',
        color: '#fff',
        weight: 1,
        fillColor: '#29739b',
        fillOpacity: 0.95,
      });
      const content = document.createElement('div'),
        title = document.createElement('strong'),
        link = document.createElement('a');
      title.textContent = facility.name;
      link.textContent = 'Public OSM source';
      link.href = facility.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      content.append(
        title,
        document.createElement('br'),
        document.createTextNode(`Public ${facility.type} · source snapshot`),
        document.createElement('br'),
        link,
      );
      marker.bindPopup(content);
      marker.addTo(markers.current);
    }
    markers.current.addTo(m);
    return () => {
      markers.current?.remove();
    };
  }, [props.facilities]);
  return (
    <div className={`hotspot-canvas-wrap ${props.reduced ? 'no-animation' : ''}`}>
      <div ref={div} className="map-canvas" aria-label={props.label} />
      <span className="gis-provider-status" role="status">
        {props.context === 'osm' ? onlineStatus : 'LOCAL VECTOR MAP'}
        {!props.administrative ? ' · DISTRICT GEOMETRY NOT CONNECTED' : ''}
      </span>
      {error && <span className="hotspot-map-error">{error}</span>}
    </div>
  );
});
export default MapCanvas;
