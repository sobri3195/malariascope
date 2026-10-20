import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Row } from '../analytics';
import type { Position } from 'geojson';
import type { MapTool } from './measurement';
import {
  countries,
  navigationFeatures,
  valueFor,
  formatValue,
  colorFor,
  indicatorInfo,
  type Filters,
  type Geometry,
  type CountryCode,
} from './engine';

export type RegionalMapHandle = {
  zoom: (delta: number) => void;
  focus: (country: CountryCode) => void;
  fit: () => void;
  image: () => string | null;
};
type Props = {
  geometry: Geometry;
  study: Geometry | null;
  rows: Row[];
  filters: Filters;
  breaks: number[];
  selectedCountry: CountryCode | null;
  onCountry: (code: CountryCode) => void;
  onDistrict: (name: string) => void;
  onCamera: (camera: [number, number, number]) => void;
  onCoordinates: (text: string) => void;
  tool: MapTool;
  panelOpen: boolean;
  points: Position[];
  areaComplete: boolean;
  onPoint: (point: Position) => void;
};
const nameOf = (properties: Record<string, unknown> | null) =>
  String(properties?.district || properties?.name || '');
const RegionalCanvas = forwardRef<RegionalMapHandle, Props>(function RegionalCanvas(props, ref) {
  const div = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    countriesLayer = useRef<L.GeoJSON | null>(null),
    navigationPoints = useRef<L.LayerGroup | null>(null),
    thematic = useRef<L.GeoJSON | null>(null),
    outlines = useRef<L.GeoJSON | null>(null),
    latest = useRef(props);
  latest.current = props;
  const fit = () => {
    const f = latest.current.filters;
    const features = navigationFeatures(f, latest.current.geometry, latest.current.study);
    const bounds = L.geoJSON({ type: 'FeatureCollection', features } as Geometry).getBounds();
    const size = map.current?.getSize(),
      small = (size?.x || 0) < 460;
    if (bounds.isValid())
      map.current?.fitBounds(bounds, {
        paddingTopLeft: [small ? 16 : 24, small ? 126 : 76],
        paddingBottomRight: [latest.current.panelOpen && !small ? 352 : 68, 86],
        maxZoom: f.district ? 11 : 10,
        animate: false,
      });
  };
  useImperativeHandle(ref, () => ({
    zoom: (delta) => {
      const m = map.current;
      if (m) m.setZoom(m.getZoom() + delta);
    },
    fit,
    focus: (code) =>
      countriesLayer.current?.eachLayer((layer) => {
        if (
          (layer as L.Polygon & { feature: { properties: Record<string, string> } }).feature
            .properties['ISO3166-1-Alpha-3'] === code
        )
          map.current?.fitBounds((layer as L.Polygon).getBounds(), {
            padding: [24, 24],
            maxZoom: 10,
            animate: false,
          });
      }),
    image: () => {
      const m = map.current;
      if (!m || !div.current) return null;
      const svg = div.current.querySelector('.leaflet-overlay-pane svg');
      if (!svg) return null;
      // SVG renderer coordinates are relative to the pane; project its viewport into the map.
      const offset = m.layerPointToContainerPoint(
        L.DomUtil.getPosition(svg as unknown as HTMLElement),
      );
      const clone = svg.cloneNode(true) as SVGElement;
      clone.querySelectorAll('[tabindex],[role],[aria-label]').forEach((el) => {
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      });
      const size = m.getSize();
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.x}" height="${size.y}" viewBox="0 0 ${size.x} ${size.y}"><rect width="100%" height="100%" fill="#edf3f6"/><svg x="${offset.x}" y="${offset.y}" width="${svg.getAttribute('width')}" height="${svg.getAttribute('height')}" viewBox="${svg.getAttribute('viewBox')}">${clone.innerHTML}</svg></svg>`;
    },
  }));
  useEffect(() => {
    if (!div.current) return;
    const m = L.map(div.current, {
      zoomControl: false,
      minZoom: 2,
      maxZoom: 16,
      zoomAnimation: false,
      fadeAnimation: false,
      attributionControl: true,
      worldCopyJump: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
    });
    m.setView([8, 117], 4);
    map.current = m;
    L.control.scale({ imperial: false }).addTo(m);
    m.attributionControl.addAttribution(
      'Natural Earth · public domain | Papua: geoBoundaries/BPS/WFP/OCHA · CC BY 3.0 IGO',
    );
    const move = () => {
      const c = m.getCenter();
      latest.current.onCamera([+c.lat.toFixed(5), +c.lng.toFixed(5), m.getZoom()]);
    };
    const coordinates = (e: L.LeafletMouseEvent) =>
      latest.current.onCoordinates(`${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
    m.on('moveend', move).on('mousemove', coordinates).on('click', coordinates);
    const addPoint = (e: L.LeafletMouseEvent) => {
      if (latest.current.tool !== 'inspect') latest.current.onPoint([e.latlng.lng, e.latlng.lat]);
    };
    m.on('click', addPoint);
    let frame = 0;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const center = m.getCenter(),
          zoom = m.getZoom();
        m.invalidateSize({ pan: false, animate: false });
        if (latest.current.filters.camera) {
          m.setView(center, zoom, { animate: false });
        } else fit();
      });
    });
    resize.observe(div.current);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const group = L.geoJSON(props.geometry, {
      style: { color: '#637a8b', weight: 1, fillColor: '#d8e1e7', fillOpacity: 0.7 },
      onEachFeature: (f, layer) => {
        const code = f.properties?.['ISO3166-1-Alpha-3'] as CountryCode;
        const name = countries.find((c) => c.code === code)?.name || '';
        const tooltip = document.createElement('span');
        layer.bindTooltip(tooltip).on('click', () => {
          if (latest.current.tool === 'inspect') latest.current.onCountry(code);
        });
        layer.on('mouseover', () => {
          if (latest.current.filters.boundaries)
            (layer as L.Path).setStyle({ weight: 3, color: '#078d94', fillOpacity: 0.75 });
        });
        layer.on('mouseout', () => {
          const f = latest.current.filters,
            selected = f.countries.includes(code);
          (layer as L.Path).setStyle({
            weight: selected ? 2.5 : 1,
            color: selected ? '#007f88' : '#637a8b',
            fillOpacity: f.boundaries ? 0.55 : 0,
          });
        });
        layer.on('add', () => {
          const element = (layer as L.Path).getElement();
          element?.setAttribute('tabindex', '0');
          element?.setAttribute('role', 'button');
          element?.setAttribute('aria-label', `Select ${name}`);
          if (element)
            (element as SVGElement).onkeydown = (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (latest.current.tool === 'inspect') latest.current.onCountry(code);
              }
            };
        });
      },
    }).addTo(m);
    countriesLayer.current = group;
    // Small countries remain selectable at regional zoom without distorting their polygons.
    const points = L.layerGroup(
      countries
        .filter((c) => ['SGP', 'BRN'].includes(c.code))
        .map((c) => {
          const marker = L.circleMarker([c.center[0], c.center[1]], {
            radius: 6,
            weight: 2,
            color: '#164d70',
            fillColor: '#fff',
            fillOpacity: 1,
          });
          const label = document.createElement('span');
          label.textContent = `${c.name} · navigation point, not analytical geometry`;
          return marker.bindTooltip(label).on('click', () => {
            if (latest.current.tool === 'inspect') latest.current.onCountry(c.code);
          });
        }),
    ).addTo(m);
    navigationPoints.current = points;
    return () => {
      group.remove();
      points.remove();
      countriesLayer.current = null;
      navigationPoints.current = null;
    };
  }, [props.geometry]);
  useEffect(() => {
    const m = map.current,
      layer = countriesLayer.current,
      points = navigationPoints.current;
    if (m && layer && points) {
      if (props.filters.boundaries) {
        layer.addTo(m);
        points.addTo(m);
      } else {
        layer.remove();
        points.remove();
      }
    }
    countriesLayer.current?.eachLayer((layer) => {
      const code = (layer as L.Polygon & { feature: { properties: Record<string, string> } })
        .feature.properties['ISO3166-1-Alpha-3'];
      const selected =
        props.filters.countries.includes(code as CountryCode) || code === props.selectedCountry;
      (layer as L.Path).setStyle({
        color: selected ? '#007f88' : '#637a8b',
        weight: selected ? 2.5 : 1,
        fillOpacity: props.filters.boundaries ? 0.55 : 0,
        opacity: props.filters.boundaries ? 1 : 0,
      });
      const name = countries.find((c) => c.code === code)?.name || code;
      const label = document.createElement('span');
      label.textContent = `${name} · ${props.filters.year} · ${props.filters.indicator === 'boundaries' ? 'Administrative context · ADM0' : `${indicatorInfo(props.filters.indicator).title}: unavailable (${indicatorInfo(props.filters.indicator).unit})`}`;
      layer.unbindTooltip();
      layer.bindTooltip(label);
    });
  }, [
    props.geometry,
    props.filters.countries,
    props.filters.boundaries,
    props.selectedCountry,
    props.filters.year,
    props.filters.indicator,
  ]);
  useEffect(() => {
    const m = map.current;
    if (!m || !props.study || props.filters.area !== 'papua') return;
    const group = L.geoJSON(props.study, {
      onEachFeature: (f, layer) => {
        const name = nameOf(f.properties);
        layer.on('click', () => {
          if (latest.current.tool === 'inspect') latest.current.onDistrict(name);
        });
        layer.on('add', () => {
          const element = (layer as L.Path).getElement();
          element?.setAttribute('tabindex', '0');
          element?.setAttribute('role', 'button');
          element?.setAttribute('aria-label', `Inspect district ${name}`);
          if (element)
            (element as SVGElement).onkeydown = (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (latest.current.tool === 'inspect') latest.current.onDistrict(name);
              }
            };
        });
      },
    }).addTo(m);
    const border = L.geoJSON(props.study, {
      interactive: false,
      style: { color: '#324e65', weight: 1.4, fill: false },
    }).addTo(m);
    thematic.current = group;
    outlines.current = border;
    return () => {
      group.remove();
      border.remove();
      thematic.current = null;
      outlines.current = null;
    };
  }, [props.study, props.filters.area]);
  useEffect(() => {
    const m = map.current,
      g = thematic.current,
      border = outlines.current,
      f = props.filters;
    if (!m || !g || !border) return;
    if (f.visible) g.addTo(m);
    else g.remove();
    if (f.boundaries) border.addTo(m);
    else border.remove();
    g.eachLayer((layer) => {
      const name = nameOf(
        (layer as L.Polygon & { feature: { properties: Record<string, unknown> } }).feature
          .properties,
      );
      const value = valueFor(
        props.rows.find((r) => r.district === name),
        f.indicator,
      );
      const active = !f.district || f.district === name;
      (layer as L.Path).setStyle({
        fillColor: f.indicator === 'boundaries' ? '#c9dfe1' : colorFor(value, props.breaks),
        fillOpacity: active ? f.opacity : 0.08,
        color: f.district === name ? '#004c59' : '#fff',
        weight: f.district === name ? 3 : 0.5,
        dashArray: f.indicator === 'prediction' ? '4 3' : undefined,
      });
      const label = document.createElement('span');
      label.textContent = `${name} · ${f.year} · ${f.indicator === 'boundaries' ? 'Study administrative context · ADM2' : `${formatValue(value)} ${indicatorInfo(f.indicator).unit} · ${indicatorInfo(f.indicator).kind}`}`;
      layer.unbindTooltip();
      layer.bindTooltip(label);
    });
    if (f.order === 'thematic') g.bringToFront();
    else border.bringToFront();
  }, [props.rows, props.filters, props.breaks, props.study]);
  useEffect(() => {
    if (!props.filters.camera) fit();
    // Geometry arriving after initial render must establish the requested extent only once.
  }, [
    props.filters.area,
    props.filters.countries.join(','),
    props.filters.district,
    props.geometry,
    props.study,
  ]);
  useEffect(() => {
    fit();
  }, [props.panelOpen]);
  useEffect(() => {
    const camera = props.filters.camera,
      m = map.current;
    if (!m || !camera) return;
    const center = m.getCenter();
    if (
      Math.abs(center.lat - camera[0]) > 0.0001 ||
      Math.abs(center.lng - camera[1]) > 0.0001 ||
      m.getZoom() !== camera[2]
    )
      m.setView([camera[0], camera[1]], camera[2], { animate: false });
  }, [props.filters.camera?.join(',')]);
  useEffect(() => {
    const m = map.current;
    if (!m || !props.points.length) return;
    const points = props.points.map((p) => L.latLng(p[1], p[0]));
    const line =
      props.areaComplete && points.length >= 3
        ? L.polygon(points, { color: '#a56412', fillOpacity: 0.12, interactive: false })
        : L.polyline(points, { color: '#a56412', dashArray: '5 4', interactive: false });
    const drawing = L.layerGroup([
      line,
      ...points.map((p) =>
        L.circleMarker(p, {
          radius: 4,
          color: '#805009',
          fillColor: '#fff',
          fillOpacity: 1,
          interactive: false,
        }),
      ),
    ]).addTo(m);
    return () => {
      drawing.remove();
    };
  }, [props.points, props.areaComplete]);
  return (
    <div
      ref={div}
      className={`asean-leaflet ${props.tool !== 'inspect' ? 'asean-drawing' : ''}`}
      aria-label="ASEAN interactive map"
    />
  );
});
export default RegionalCanvas;
