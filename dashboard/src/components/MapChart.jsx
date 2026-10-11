// ATLAS-A11Y-HEX-SWEPT
/**
 * MapChart - Mapa coroplético com Leaflet
 * Padrão DataGeo Paraná - Módulo Saúde
 */

import { useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, Pane, useMap } from 'react-leaflet';
import { formatNumber } from '../utils/format';
import { ATLAS_CLAY } from '../utils/chart-palette';
import { limitesClasses, classeDoValor, corDaClasse } from '../utils/graficos';

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
    if (!bounds) return undefined;
    let ativo = true;
    const enquadrar = () => {
      if (!ativo) return;
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds, { padding: [12, 12], animate: false });
    };
    enquadrar();
    // O contêiner pode mudar de tamanho depois de montado (CSS do celular,
    // fontes, grade): sem reenquadrar, o estado ficava deslocado com uma faixa
    // vazia. O cleanup só desliga o observador, nunca chama o mapa removido.
    const observador = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => enquadrar())
      : null;
    observador?.observe(map.getContainer());
    return () => {
      ativo = false;
      observador?.disconnect();
    };
  }, [bounds, map]);

  return null;
}

// Escalas de cores para diferentes métricas
const COLOR_SCALES = {
  // Sequencial mono-matiz (ATLAS_CLAY): ordem preservada por luminância,
  // segura para daltonismo, alinhada à paleta do ecossistema.
  obitos: ATLAS_CLAY,
  internacoes: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#3d729c', '#2d5f7f', '#254e69', '#075985'],
  // Sequencial de um só tom (verde): a anterior alternava verde e azul fora
  // de ordem e a cor não lia como "mais" ou "menos"
  cobertura: ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#166534'],
  leitos: ['#fef3c7', '#fde68a', '#fcd34d', '#e0b850', '#c89b3c', '#a87f2d', '#b45309', '#92400e'],
  repasse: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'],
  default: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#3d729c', '#2d5f7f', '#254e69']
};

// O nome vem de TopoJSON remoto e entra num tooltip HTML: escapar.
const escapeHtml = (texto) => String(texto).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function getColor(value, limites, scale = 'default') {
  if (value === null || value === undefined || isNaN(value)) {
    return '#e5e7eb'; // Cinza para dados ausentes
  }
  const colors = COLOR_SCALES[scale] || COLOR_SCALES.default;
  return corDaClasse(classeDoValor(value, limites), limites.length - 1, colors);
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
  // Celular: pontos menores, senão os hospitais se encobrem (a altura do mapa
  // no celular vem do CSS .map-viewport)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const escalaPontos = isMobile ? 0.6 : 1;
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

  // Limites das classes de cor (iguais, ou quantis se a distribuição for
  // muito assimétrica; ver limitesClasses)
  const { limites, tipo: tipoClasses, contagem } = useMemo(() => {
    const colors = COLOR_SCALES[colorScale] || COLOR_SCALES.default;
    const values = (data || [])
      .map(item => item[metric])
      .filter(v => v !== null && v !== undefined && !isNaN(v))
      .map(Number);
    return limitesClasses(values, colors.length);
  }, [data, metric, colorScale]);

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
      fillColor: getColor(value, limites, colorScale),
      weight: isSelected ? 3 : 1,
      opacity: 1,
      color: isSelected ? '#1e40af' : '#918058',
      fillOpacity: isSelected ? 0.9 : 0.7
    };
  };
  // Os handlers de cada feição são ligados uma vez; o mouseout precisa do
  // estilo atual (com a seleção vigente), não do capturado na montagem.
  // resetStyle() reaplicava o style inicial e apagava o realce da seleção.
  const styleRef = useRef(getFeatureStyle);
  useLayoutEffect(() => {
    styleRef.current = getFeatureStyle;
  });

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
        <strong class="text-dark-900">${escapeHtml(name)}</strong>
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
        e.target.setStyle(styleRef.current(feature));
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
    const classes = limites.length - 1;
    if (limites[0] === limites[classes]) {
      // Um único valor (ex.: um município selecionado): uma classe só
      return [{ color: corDaClasse(0, 1, colors), label: formatValue(limites[0]) }];
    }
    // Classes sem município não entram na legenda; a do mínimo repetido
    // ([0, 0]) aparece como valor único ("0")
    return Array.from({ length: classes }, (_, i) => ({
      color: corDaClasse(i, classes, colors),
      label: limites[i] === limites[i + 1]
        ? formatValue(limites[i])
        : `${formatValue(limites[i])} - ${formatValue(limites[i + 1])}`,
      vazia: (contagem?.[i] ?? 1) === 0
    })).filter((item) => !item.vazia);
  }, [limites, contagem, colorScale, formatValue]);

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
      radius: pointRadius(point.leitos) * escalaPontos,
      pathOptions: {
        color,
        weight: 1.5,
        opacity: 0.9,
        fillColor: point.sus ? color : '#ffffff',
        fillOpacity: point.sus ? 0.85 : 0.95
      }
    };
  }), [visiblePoints, pointColor, escalaPontos]);

  const pointLegend = useMemo(() => {
    const tipos = [...new Set(visiblePoints.map(p => p.tipo))];
    return tipos.map(tipo => ({
      tipo,
      label: POINT_LABELS[tipo] || tipo,
      color: resolvePointColor({ tipo }, pointColor)
    }));
  }, [visiblePoints, pointColor]);


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
    <div className="bg-white rounded-2xl shadow-card p-6 h-full">
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
          // zoom fracionário: com passos inteiros o Paraná ocupava ~metade do quadro
          zoomSnap={0.25}
          zoomDelta={0.5}
        >
          <TileLayer
            attribution='Tiles &copy; Esri, DeLorme, NAVTEQ'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={16}
          />

          <GeoJSON
            key={`geojson-${metric}-${Array.isArray(data) ? data.length : Object.keys(data || {}).length}-${limites.join('|')}`}
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
      </div>

      {/* Legenda abaixo do mapa: sobreposta, cobria o oeste do Paraná (e
          metade do estado no mapa de leitos com pontos) */}
      <div className="mt-3 space-y-1.5" aria-label="Legenda do mapa">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {tipoClasses === 'quantis' && (
            <span className="text-[11px] text-dark-500">Classes por quantis (cada faixa reúne parte parecida dos municípios):</span>
          )}
          {legendItems.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="w-3 h-2.5 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[11px] text-dark-600 leading-tight">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: '#e5e7eb' }} />
            <span className="text-[11px] text-dark-600 leading-tight">Sem dados</span>
          </div>
        </div>
        {pointLegend.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {pointLegend.map(item => (
              <div key={item.tipo} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[11px] text-dark-600 leading-tight">{item.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 flex-shrink-0 rounded-full bg-white"
                style={{ border: `1.5px solid ${POINT_COLORS.default}` }}
              />
              <span className="text-[11px] text-dark-600 leading-tight">Círculo vazado: não atende pelo SUS</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MapChart;
