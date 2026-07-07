// ATLAS-A11Y-HEX-SWEPT
/**
 * MapChart - Mapa coroplético com Leaflet
 * Padrão DataGeo Paraná - Módulo Saúde
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { formatNumber, formatPercent, formatCurrency } from '../utils/format';
import { ATLAS_CLAY } from '../utils/chart-palette';

// Componente para ajustar bounds do mapa
function FitBounds({ geoData }) {
  const map = useMap();

  useEffect(() => {
    if (geoData?.features?.length > 0) {
      const bounds = [];
      geoData.features.forEach(feature => {
        if (feature.geometry?.coordinates) {
          const coords = feature.geometry.coordinates.flat(3);
          for (let i = 0; i < coords.length; i += 2) {
            if (typeof coords[i] === 'number' && typeof coords[i + 1] === 'number') {
              bounds.push([coords[i + 1], coords[i]]);
            }
          }
        }
      });
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }, [geoData, map]);

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
  selectedFeature
}) {
  const mapRef = useRef(null);
  const geoJsonRef = useRef(null);
  const [hoveredFeature, setHoveredFeature] = useState(null);

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
    const isHovered = hoveredFeature === code;

    return {
      fillColor: getColor(value, min, max, colorScale),
      weight: isSelected ? 3 : isHovered ? 2 : 1,
      opacity: 1,
      color: isSelected ? '#1e40af' : isHovered ? '#3b82f6' : '#918058',
      fillOpacity: isSelected ? 0.9 : isHovered ? 0.85 : 0.7
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
        setHoveredFeature(code);
        e.target.setStyle({
          weight: 2,
          color: '#3b82f6',
          fillOpacity: 0.85
        });
        e.target.bringToFront();
      },
      mouseout: (e) => {
        setHoveredFeature(null);
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
    const step = (max - min) / colors.length;

    return colors.map((color, i) => ({
      color,
      label: `${formatValue(min + step * i)} - ${formatValue(min + step * (i + 1))}`
    }));
  }, [min, max, colorScale, formatValue]);

  if (!geoData?.features) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6" style={{ height }}>
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

      <div className="relative" style={{ height }}>
        <MapContainer
          ref={mapRef}
          center={[-24.5, -51.5]}
          zoom={7}
          style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}
          scrollWheelZoom={true}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          />

          <GeoJSON
            key={`geojson-${metric}-${Array.isArray(data) ? data.length : Object.keys(data || {}).length}-${min}-${max}`}
            ref={geoJsonRef}
            data={geoData}
            style={getFeatureStyle}
            onEachFeature={onEachFeature}
          />

          <FitBounds geoData={geoData} />
        </MapContainer>

        {/* Legenda */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-md p-3 z-[1000]">
          <p className="text-xs font-medium text-dark-700 mb-2">Legenda</p>
          <div className="flex flex-col gap-1">
            {legendItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-4 h-3 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-dark-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MapChart;
