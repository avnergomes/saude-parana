/**
 * TreemapChart - Treemap hierárquico com D3
 * Padrão DataGeo Paraná - Módulo Saúde
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { formatNumber, formatPercent } from '../utils/format';

function TreemapChart({
  data = [],
  valueKey = 'total',
  nameKey = 'nome',
  colorKey = 'cor',
  title = 'Treemap',
  height = 400,
  onItemClick,
  selectedItem,
  showPercentage = true
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });
  const [hoveredItem, setHoveredItem] = useState(null);

  // Calcular total para percentuais
  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + (item[valueKey] || 0), 0);
  }, [data, valueKey]);

  // Preparar dados para treemap
  const hierarchyData = useMemo(() => {
    if (!data || data.length === 0) return null;

    return {
      name: 'root',
      children: data.map(item => ({
        name: item[nameKey] || 'Sem nome',
        value: item[valueKey] || 0,
        color: item[colorKey] || '#6366f1',
        codigo: item.codigo || item.capitulo || item.id,
        original: item
      }))
    };
  }, [data, valueKey, nameKey, colorKey]);

  // Observar redimensionamento
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [height]);

  // Renderizar treemap
  useEffect(() => {
    if (!svgRef.current || !hierarchyData || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width } = dimensions;
    const margin = { top: 0, right: 0, bottom: 0, left: 0 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Criar hierarquia
    const root = d3.hierarchy(hierarchyData)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);

    // Criar layout treemap
    d3.treemap()
      .size([innerWidth, innerHeight])
      .paddingOuter(3)
      .paddingInner(2)
      .round(true)(root);

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Criar células
    const leaves = root.leaves();

    const cells = g.selectAll('g.cell')
      .data(leaves)
      .join('g')
      .attr('class', 'cell')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    // Retângulos
    cells.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('rx', 4)
      .attr('fill', d => d.data.color)
      .attr('fill-opacity', d => {
        if (selectedItem && d.data.codigo === selectedItem) return 1;
        if (hoveredItem === d.data.codigo) return 0.9;
        return 0.85;
      })
      .attr('stroke', d => {
        if (selectedItem && d.data.codigo === selectedItem) return '#1e40af';
        return 'transparent';
      })
      .attr('stroke-width', d => {
        if (selectedItem && d.data.codigo === selectedItem) return 2;
        return 0;
      })
      .style('cursor', onItemClick ? 'pointer' : 'default')
      .on('mouseenter', (event, d) => {
        setHoveredItem(d.data.codigo);
        d3.select(event.currentTarget)
          .attr('fill-opacity', 0.95);
      })
      .on('mouseleave', (event, d) => {
        setHoveredItem(null);
        d3.select(event.currentTarget)
          .attr('fill-opacity', selectedItem === d.data.codigo ? 1 : 0.85);
      })
      .on('click', (event, d) => {
        if (onItemClick) {
          onItemClick(d.data.codigo, d.data.name, d.data.original);
        }
      });

    // Textos (nome)
    cells.append('text')
      .attr('x', 6)
      .attr('y', 18)
      .attr('fill', '#fff')
      .attr('font-size', d => {
        const cellWidth = d.x1 - d.x0;
        const cellHeight = d.y1 - d.y0;
        if (cellWidth < 60 || cellHeight < 30) return '9px';
        if (cellWidth < 100 || cellHeight < 50) return '11px';
        return '12px';
      })
      .attr('font-weight', '600')
      .style('pointer-events', 'none')
      .text(d => {
        const cellWidth = d.x1 - d.x0;
        const name = d.data.name;
        if (cellWidth < 40) return '';
        if (cellWidth < 80) return name.substring(0, 8) + (name.length > 8 ? '...' : '');
        if (cellWidth < 120) return name.substring(0, 15) + (name.length > 15 ? '...' : '');
        return name.substring(0, 25) + (name.length > 25 ? '...' : '');
      });

    // Textos (valor)
    cells.append('text')
      .attr('x', 6)
      .attr('y', 34)
      .attr('fill', 'rgba(255,255,255,0.9)')
      .attr('font-size', '10px')
      .style('pointer-events', 'none')
      .text(d => {
        const cellWidth = d.x1 - d.x0;
        const cellHeight = d.y1 - d.y0;
        if (cellWidth < 50 || cellHeight < 40) return '';

        const value = formatNumber(d.data.value);
        const percent = showPercentage ? ` (${((d.data.value / total) * 100).toFixed(1)}%)` : '';
        return value + percent;
      });

  }, [hierarchyData, dimensions, height, total, onItemClick, selectedItem, hoveredItem, showPercentage]);

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6" style={{ height }}>
        <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>
        <div className="flex items-center justify-center h-full text-dark-400">
          Sem dados disponíveis
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>

      <div ref={containerRef} className="w-full">
        <svg ref={svgRef} style={{ width: '100%', height }} />
      </div>

      {/* Tooltip */}
      {hoveredItem && (
        <div className="mt-2 text-sm text-dark-600">
          {(() => {
            const item = data.find(d => (d.codigo || d.capitulo || d.id) === hoveredItem);
            if (!item) return null;
            return (
              <span>
                <strong>{item[nameKey]}</strong>: {formatNumber(item[valueKey])}
                {showPercentage && ` (${((item[valueKey] / total) * 100).toFixed(1)}%)`}
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default TreemapChart;
