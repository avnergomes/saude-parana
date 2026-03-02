/**
 * MapChart - Mapa coroplético com Leaflet
 * Padrão DataGeo Paraná - Módulo Saúde
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { formatNumber, formatPercent, formatCurrency } from '../utils/format';

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
  obitos: ['#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'],
  internacoes: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985'],
  cobertura: ['#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534'],
  leitos: ['#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e'],
  repasse: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'],
  default: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1']
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

    const isSelected = selectedFeature === code;
    const isHovered = hoveredFeature === code;

    return {
      fillColor: getColor(value, min, max, colorScale),
      weight: isSelected ? 3 : isHovered ? 2 : 1,
      opacity: 1,
      color: isSelected ? '#1e40af' : isHovered ? '#3b82f6' : '#94a3b8',
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

  // Gerar legenda
  const legendItems = useMemo(() => {
    const colors = COLOR_SCALES[colorScale] || COLOR_SCALES.default;
    const step = (max - min) / colors.length;

    return colors.map((color, i) => ({
      color,
      label: formatValue(min + step * i)
    }));
  }, [min, max, colorScale, formatValue]);

  if (!geoData?.features) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6" style={{ height }}>
        <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>
        <div className="flex items-center justify-center h-full text-dark-400">
          Carregando mapa...
        </div>
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
            {legendItems.slice(0, 5).map((item, i) => (
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
