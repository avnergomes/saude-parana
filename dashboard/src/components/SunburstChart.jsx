/**
 * SunburstChart - Gráfico Sunburst (radial hierárquico) com D3
 * Padrão DataGeo Paraná - Módulo Saúde
 * Usado para visualizar hierarquia CID-10 (capítulo > grupo > causa)
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { formatNumber, formatPercent } from '../utils/format';

function SunburstChart({
  data = null,
  title = 'Hierarquia',
  height = 450,
  onArcClick,
  showBreadcrumb = true,
  formatValue = formatNumber
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });
  const [hoveredArc, setHoveredArc] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [currentRoot, setCurrentRoot] = useState(null);

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

  // Calcular total
  const total = useMemo(() => {
    if (!data) return 0;

    function sumValues(node) {
      if (node.value) return node.value;
      if (node.children) {
        return node.children.reduce((sum, child) => sum + sumValues(child), 0);
      }
      return 0;
    }

    return sumValues(data);
  }, [data]);

  // Renderizar Sunburst
  useEffect(() => {
    if (!svgRef.current || !data || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width } = dimensions;
    const size = Math.min(width, height);
    const radius = size / 2;

    // Criar hierarquia
    const root = d3.hierarchy(data)
      .sum(d => d.value || 0)
      .sort((a, b) => b.value - a.value);

    // Criar layout de partição
    const partition = d3.partition()
      .size([2 * Math.PI, radius]);

    partition(root);

    // Arco
    const arc = d3.arc()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .padAngle(0.005)
      .padRadius(radius / 2)
      .innerRadius(d => Math.max(0, d.y0 * 0.7))
      .outerRadius(d => Math.max(0, d.y1 * 0.7 - 1));

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Escala de cores
    const colorScale = d3.scaleOrdinal()
      .domain(root.children?.map(d => d.data.name) || [])
      .range([
        '#ef4444', '#f97316', '#f59e0b', '#eab308',
        '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
        '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
        '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
      ]);

    function getColor(d) {
      if (d.data.color) return d.data.color;

      // Usar cor do ancestral de primeiro nível
      let current = d;
      while (current.depth > 1) {
        current = current.parent;
      }
      return current.depth === 0
        ? '#6366f1'
        : colorScale(current.data.name);
    }

    // Desenhar arcos
    const paths = g.selectAll('path')
      .data(root.descendants().filter(d => d.depth > 0))
      .join('path')
      .attr('d', arc)
      .attr('fill', d => getColor(d))
      .attr('fill-opacity', d => {
        const opacity = 1 - d.depth * 0.15;
        if (hoveredArc && hoveredArc.data.name === d.data.name) {
          return Math.min(1, opacity + 0.15);
        }
        return opacity;
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        setHoveredArc(d);

        // Construir breadcrumb
        const ancestors = d.ancestors().reverse();
        setBreadcrumb(ancestors.map(a => ({
          name: a.data.name,
          value: a.value,
          depth: a.depth
        })));
      })
      .on('mouseleave', () => {
        setHoveredArc(null);
        setBreadcrumb([]);
      })
      .on('click', (event, d) => {
        if (onArcClick) {
          onArcClick(d.data, d);
        }

        // Zoom para o arco clicado
        if (d.children) {
          setCurrentRoot(d);
        }
      });

    // Labels para arcos grandes
    g.selectAll('text')
      .data(root.descendants().filter(d => {
        // Mostrar label apenas para arcos com ângulo > 0.1 rad e depth <= 2
        return d.depth > 0 && d.depth <= 2 && (d.x1 - d.x0) > 0.15;
      }))
      .join('text')
      .attr('transform', d => {
        const angle = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const r = (d.y0 + d.y1) / 2 * 0.7;
        return `rotate(${angle - 90}) translate(${r},0) rotate(${angle < 180 ? 0 : 180})`;
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.depth === 1 ? '10px' : '9px')
      .attr('fill', '#fff')
      .attr('font-weight', d => d.depth === 1 ? '600' : '400')
      .style('pointer-events', 'none')
      .text(d => {
        const name = d.data.name;
        const maxLen = d.depth === 1 ? 12 : 8;
        return name.length > maxLen ? name.substring(0, maxLen) + '...' : name;
      });

    // Centro com informação
    g.append('circle')
      .attr('r', radius * 0.18)
      .attr('fill', '#f8fafc')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 1);

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.3em')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', '#374151')
      .text('Total');

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1em')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .attr('fill', '#0ea5e9')
      .text(formatValue(total));

  }, [data, dimensions, height, total, formatValue, hoveredArc, onArcClick]);

  if (!data) {
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

      {/* Breadcrumb */}
      {showBreadcrumb && breadcrumb.length > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm overflow-x-auto pb-2">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-dark-300">›</span>}
              <span
                className={`px-2 py-1 rounded ${
                  i === breadcrumb.length - 1
                    ? 'bg-water-100 text-water-700 font-medium'
                    : 'text-dark-500'
                }`}
              >
                {item.name}
                {item.depth > 0 && (
                  <span className="ml-1 text-dark-400">
                    ({formatValue(item.value)})
                  </span>
                )}
              </span>
            </span>
          ))}
        </div>
      )}

      <div ref={containerRef} className="w-full flex justify-center">
        <svg ref={svgRef} style={{ width: '100%', maxWidth: height, height }} />
      </div>

      {/* Info do hover */}
      {hoveredArc && (
        <div className="mt-4 p-3 bg-neutral-50 rounded-lg">
          <p className="font-medium text-dark-900">{hoveredArc.data.name}</p>
          <p className="text-sm text-dark-600">
            {formatValue(hoveredArc.value)} ({((hoveredArc.value / total) * 100).toFixed(1)}%)
          </p>
          {hoveredArc.children && (
            <p className="text-xs text-dark-400 mt-1">
              Clique para expandir ({hoveredArc.children.length} subcategorias)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SunburstChart;
