// ATLAS-A11Y-HEX-SWEPT
/**
 * MapChart - Mapa coroplético com Leaflet
 * Padrão DataGeo Paraná - Módulo Saúde
 */

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, Pane, useMap } from 'react-leaflet';
import { formatNumber } from '../utils/format';
import { ATLAS_CLAY } from '../utils/chart-palette';

// Limites da malha calculados uma vez por objeto geoData (todas as instâncias
// de mapa reaproveitam), em vez de achatar todos os vértices a cada montagem.
const BOUNDS_CACHE = new WeakMap();

function boundsDaMalha(geoData) {
  if (!geoData?.features?.length) return null;
  if (BOUNDS_CACHE.has(geoData)) return BOUNDS_CACHE.get(geoData);
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  geoData.features.forEach(feature => {
    const coords = feature.geometry?.coordinates?.flat(3) || [];
    for (let i = 0; i < coords.length; i += 2) {
      const lon = coords[i];
      const lat = coords[i + 1];
      if (typeof lon === 'number' && typeof lat === 'number') {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
    }
  });
  const bounds = Number.isFinite(minLat) ? [[minLat, minLon], [maxLat, maxLon]] : null;
  BOUNDS_CACHE.set(geoData, bounds);
  return bounds;
}

// Enquadra o mapa sem animação. Não chamar map.stop() no cleanup: ao trocar
// de aba o react-leaflet já removeu o mapa e qualquer método que consulte o
// painel quebra (TypeError _leaflet_pos). O zoomAnimation do MapContainer
// fica desligado pelo mesmo motivo: o timeout de 250 ms da animação do
// Leaflet sobrevive ao remove() e tentava mover um painel já destruído.
function FitBounds({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20], animate: false });
    }
  }, [bounds, map]);

  return null;
}

// Escalas de cores para diferentes métricas
const COLOR_SCALES = {
  // Sequencial mono-matiz (ATLAS_CLAY): ordem preservada por luminância,
  // segura para daltonismo, alinhada à paleta do ecossistema.
  obitos: ATLAS_CLAY,
  internacoes: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#3d729c', '#2d5f7f', '#254e69', '#075985'],
  cobertura: ['#d9e6f0', '#bbf7d0', '#87afcd', '#4ade80', '#0072B2', '#005c8e', '#004a72', '#166534'],
  leitos: ['#fef3c7', '#fde68a', '#fcd34d', '#e0b850', '#c89b3c', '#a87f2d', '#b45309', '#92400e'],
  repasse: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'],
  default: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#3d729c', '#2d5f7f', '#254e69']
};

function getColor(value, min, max, scale = 'default') {
  if (value === null || value === undefined || isNaN(value)) {
    return '#e5e7eb'; // Cinza para dados ausentes
  }

  const colors = COLOR_SCALES[scale] || COLOR_SCALES.default;
  const range = max - min;

  if (range === 0) return colors[4];

  const normalized = (value - min) / range;
  const index = Math.min(Math.floor(normalized * colors.length), colors.length - 1);

  return colors[Math.max(0, index)];
}

// Camada opcional de pontos (hospitais e UPAs): cor por tipo (tinta para a
// classe numerosa, azul Okabe-Ito como acento), raio pela raiz quadrada dos
// leitos e preenchimento cheio só para unidades que atendem pelo SUS.
const POINT_COLORS = {
  hospital: '#2a2419',
  pronto_atendimento: '#0072B2',
  default: '#6e6453'
};
const POINT_LABELS = {
  hospital: 'Hospitais',
  pronto_atendimento: 'UPA e pronto atendimento'
};
const MAX_POINTS = 800;
const POINT_RADIUS_MIN = 3;
const POINT_RADIUS_MAX = 12;

function pointRadius(leitos) {
  const n = typeof leitos === 'number' && leitos > 0 ? leitos : 0;
  return Math.max(POINT_RADIUS_MIN, Math.min(POINT_RADIUS_MAX, POINT_RADIUS_MIN + Math.sqrt(n) * 0.45));
}

function resolvePointColor(point, pointColor) {
  if (typeof pointColor === 'function') return pointColor(point) || POINT_COLORS.default;
  const mapa = pointColor || POINT_COLORS;
  return mapa[point?.tipo] || POINT_COLORS.default;
}

function MapChart({
  geoData,
  geoError = false,
  onRetryGeo,
  data,
  metric = 'valor',
  title = 'Mapa',
  colorScale = 'default',
  formatValue = formatNumber,
  height = 450,
  onFeatureClick,
  selectedFeature,
  points = null,
  pointColor = null
}) {
  const mapRef = useRef(null);
  const geoJsonRef = useRef(null);
  const bounds = useMemo(() => boundsDaMalha(geoData), [geoData]);

  // Preparar dados por código IBGE
  const dataByCode = useMemo(() => {
    if (!data) return {};

    const map = {};
    data.forEach(item => {
      const code = item.cod_ibge || item.codigo || item.id;
      if (code) {
        map[String(code).substring(0, 6)] = item;
      }
    });
    return map;
  }, [data]);

  // Calcular min/max para escala de cores
  const { min, max } = useMemo(() => {
    if (!data || data.length === 0) {
      return { min: 0, max: 100 };
    }

    const values = data
      .map(item => item[metric])
      .filter(v => v !== null && v !== undefined && !isNaN(v));

    if (values.length === 0) {
      return { min: 0, max: 100 };
    }

    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }, [data, metric]);

  // Estilo para cada feature
  const getFeatureStyle = (feature) => {
    const props = feature.properties || {};
    const code = String(props.CD_MUN || props.CodIbge || props.cod_ibge || props.id || '').substring(0, 6);
    const featureData = dataByCode[code];
    const value = featureData ? featureData[metric] : null;

    // selectedFeature pode chegar com 7 dígitos (dados) ou 6 (mapa)
    const isSelected = selectedFeature != null
      && String(selectedFeature).substring(0, 6) === code;

    // O realce de hover é imperativo (setStyle/resetStyle nos handlers), sem
    // estado React: um estado por hover re-renderizava 399 feições e 640 pontos.
    return {
      fillColor: getColor(value, min, max, colorScale),
      weight: isSelected ? 3 : 1,
      opacity: 1,
      color: isSelected ? '#1e40af' : '#918058',
      fillOpacity: isSelected ? 0.9 : 0.7
    };
  };

  // Handlers para cada feature
  const onEachFeature = (feature, layer) => {
    const props = feature.properties || {};
    const code = String(props.CD_MUN || props.CodIbge || props.cod_ibge || props.id || '').substring(0, 6);
    const name = props.NM_MUN || props.Municipio || props.nome || props.name || 'Município';
    const featureData = dataByCode[code];
    const value = featureData ? featureData[metric] : null;

    // Tooltip
    const tooltipContent = `
      <div class="font-sans">
        <strong class="text-dark-900">${name}</strong>
        <br/>
        <span class="text-dark-600">
          ${value !== null ? formatValue(value) : 'Sem dados'}
        </span>
      </div>
    `;

    layer.bindTooltip(tooltipContent, {
      permanent: false,
      direction: 'top',
      className: 'leaflet-tooltip-custom'
    });

    layer.on({
      mouseover: (e) => {
        e.target.setStyle({
          weight: 2,
          color: '#3b82f6',
          fillOpacity: 0.85
        });
        e.target.bringToFront();
      },
      mouseout: (e) => {
        if (geoJsonRef.current) {
          geoJsonRef.current.resetStyle(e.target);
        }
      },
      click: () => {
        if (onFeatureClick) {
          onFeatureClick(code, name, featureData);
        }
      }
    });
  };

  // Gerar legenda: todas as classes, rotuladas por faixa (inclui o teto)
  const legendItems = useMemo(() => {
    const colors = COLOR_SCALES[colorScale] || COLOR_SCALES.default;
    if (max === min) {
      // Um único valor (ex.: um município selecionado): uma classe só
      return [{ color: colors[4], label: formatValue(min) }];
    }
    const step = (max - min) / colors.length;

    return colors.map((color, i) => ({
      color,
      label: `${formatValue(min + step * i)} - ${formatValue(min + step * (i + 1))}`
    }));
  }, [min, max, colorScale, formatValue]);

  // Pontos válidos (lat/lon numéricos), maiores unidades primeiro, com teto
  // para manter o mapa leve. Vazio quando a prop não é informada.
  const visiblePoints = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) return [];
    return points
      .filter(p => typeof p?.lat === 'number' && typeof p?.lon === 'number')
      .sort((a, b) => (b.leitos || 0) - (a.leitos || 0))
      .slice(0, MAX_POINTS);
  }, [points]);

  // Props dos marcadores calculadas uma vez: objetos novos a cada render
  // fariam o react-leaflet reaplicar setLatLng/setStyle em todos os pontos.
  const marcadores = useMemo(() => visiblePoints.map((point, i) => {
    const color = resolvePointColor(point, pointColor);
    return {
      point,
      key: point.cnes || `${point.lat}-${point.lon}-${i}`,
      code: String(point.cod_ibge || '').substring(0, 6),
      center: [point.lat, point.lon],
      radius: pointRadius(point.leitos),
      pathOptions: {
        color,
        weight: 1.5,
        opacity: 0.9,
        fillColor: point.sus ? color : '#ffffff',
        fillOpacity: point.sus ? 0.85 : 0.95
      }
    };
  }), [visiblePoints, pointColor]);

  const pointLegend = useMemo(() => {
    const tipos = [...new Set(visiblePoints.map(p => p.tipo))];
    return tipos.map(tipo => ({
      tipo,
      label: POINT_LABELS[tipo] || tipo,
      color: resolvePointColor({ tipo }, pointColor)
    }));
  }, [visiblePoints, pointColor]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  if (!geoData?.features) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6 map-viewport" style={{ height }}>
        <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>
        {geoError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <p className="text-dark-600 font-medium">Não foi possível carregar o mapa.</p>
            <p className="text-dark-400 text-sm">
              Falha ao baixar a malha municipal. Verifique sua conexão e tente novamente.
            </p>
            {onRetryGeo && (
              <button
                type="button"
                onClick={onRetryGeo}
                className="px-4 py-2 bg-water-600 text-white rounded-lg text-sm font-medium hover:bg-water-700 transition-colors"
              >
                Tentar novamente
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <span className="text-dark-400">Carregando mapa...</span>
            <span className="text-dark-400 text-xs">Baixando a malha municipal (aprox. 4 MB)</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>

      <div className="relative map-viewport" style={{ height }}>
        <MapContainer
          ref={mapRef}
          center={[-24.5, -51.5]}
          zoom={7}
          style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}
          scrollWheelZoom={false}
          dragging={!isMobile}
          zoomControl={true}
          zoomAnimation={false}
        >
          <TileLayer
            attribution='Tiles &copy; Esri, DeLorme, NAVTEQ'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={16}
          />

          <GeoJSON
            key={`geojson-${metric}-${Array.isArray(data) ? data.length : Object.keys(data || {}).length}-${min}-${max}`}
            ref={geoJsonRef}
            data={geoData}
            style={getFeatureStyle}
            onEachFeature={onEachFeature}
          />

          {marcadores.length > 0 && (
            <Pane name="map-points" style={{ zIndex: 450 }}>
              {marcadores.map(({ point, key, code, center, radius, pathOptions }) => {
                return (
                  <CircleMarker
                    key={key}
                    center={center}
                    radius={radius}
                    pathOptions={pathOptions}
                    eventHandlers={{
                      click: () => {
                        if (onFeatureClick && code) {
                          const featureData = dataByCode[code];
                          onFeatureClick(code, featureData?.municipio || featureData?.nome || code, featureData);
                        }
                      }
                    }}
                  >
                    <Tooltip direction="top" className="leaflet-tooltip-custom">
                      <div className="font-sans">
                        <strong className="text-dark-900">{point.nome}</strong>
                        <br />
                        <span className="text-dark-600">{POINT_LABELS[point.tipo] || point.tipo}</span>
                        {point.leitos != null && (
                          <span className="text-dark-600">
                            {' | '}
                            <span>Leitos:</span>
                            {' '}
                            {formatNumber(point.leitos)}
                          </span>
                        )}
                        <br />
                        <span className="text-dark-500 text-xs">
                          {point.sus ? 'Atende pelo SUS' : 'Não atende pelo SUS'}
                        </span>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}
            </Pane>
          )}

          <FitBounds bounds={bounds} />
        </MapContainer>

        {/* Legenda */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-md p-2 sm:p-3 z-[1000]">
          <p className="text-xs font-medium text-dark-700 mb-1.5">Legenda</p>
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-3 gap-y-0.5">
            {legendItems.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-2.5 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[10px] sm:text-xs text-dark-600 leading-tight">{item.label}</span>
              </div>
            ))}
          </div>
          {pointLegend.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-neutral-200 space-y-0.5">
              {pointLegend.map(item => (
                <div key={item.tipo} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[10px] sm:text-xs text-dark-600 leading-tight">{item.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 flex-shrink-0 rounded-full bg-white"
                  style={{ border: `1.5px solid ${POINT_COLORS.default}` }}
                />
                <span className="text-[10px] sm:text-xs text-dark-600 leading-tight">Círculo vazado: não atende pelo SUS</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapChart;
