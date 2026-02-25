/**
 * SankeyChart - Diagrama Sankey com D3
 * Padrão DataGeo Paraná - Módulo Saúde
 * Usado para visualizar fluxo de repasses SUS
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { formatCurrency, formatNumber } from '../utils/format';

// Implementação simplificada de Sankey layout
function sankeyLayout() {
  let nodeWidth = 24;
  let nodePadding = 16;
  let size = [1, 1];

  function sankey(graph) {
    const { nodes, links } = graph;

    // Calcular níveis dos nós
    const nodesByLevel = {};
    nodes.forEach(node => {
      const level = node.level || 0;
      if (!nodesByLevel[level]) nodesByLevel[level] = [];
      nodesByLevel[level].push(node);
    });

    const levels = Object.keys(nodesByLevel).sort((a, b) => a - b);
    const levelCount = levels.length;

    // Posicionar nós horizontalmente
    const xScale = (size[0] - nodeWidth) / Math.max(1, levelCount - 1);

    levels.forEach((level, i) => {
      const levelNodes = nodesByLevel[level];
      levelNodes.forEach(node => {
        node.x0 = i * xScale;
        node.x1 = node.x0 + nodeWidth;
      });
    });

    // Calcular valores dos nós
    nodes.forEach(node => {
      const outgoing = links.filter(l => l.source === node || l.source === node.id);
      const incoming = links.filter(l => l.target === node || l.target === node.id);

      node.sourceLinks = outgoing;
      node.targetLinks = incoming;

      const outValue = outgoing.reduce((sum, l) => sum + l.value, 0);
      const inValue = incoming.reduce((sum, l) => sum + l.value, 0);
      node.value = Math.max(outValue, inValue, node.value || 0);
    });

    // Posicionar nós verticalmente por nível
    levels.forEach(level => {
      const levelNodes = nodesByLevel[level];
      const totalValue = levelNodes.reduce((sum, n) => sum + n.value, 0);
      const totalPadding = nodePadding * (levelNodes.length - 1);
      const availableHeight = size[1] - totalPadding;

      let y = 0;
      levelNodes.forEach(node => {
        const nodeHeight = (node.value / totalValue) * availableHeight;
        node.y0 = y;
        node.y1 = y + Math.max(nodeHeight, 10);
        y = node.y1 + nodePadding;
      });
    });

    // Resolver referências de links
    links.forEach(link => {
      if (typeof link.source === 'string' || typeof link.source === 'number') {
        link.source = nodes.find(n => n.id === link.source) || nodes[link.source];
      }
      if (typeof link.target === 'string' || typeof link.target === 'number') {
        link.target = nodes.find(n => n.id === link.target) || nodes[link.target];
      }

      // Calcular posições Y dos links
      link.y0 = link.source.y0 + (link.source.y1 - link.source.y0) / 2;
      link.y1 = link.target.y0 + (link.target.y1 - link.target.y0) / 2;
      link.width = Math.max(2, (link.value / link.source.value) * (link.source.y1 - link.source.y0));
    });

    return { nodes, links };
  }

  sankey.nodeWidth = function(_) {
    return arguments.length ? (nodeWidth = _, sankey) : nodeWidth;
  };

  sankey.nodePadding = function(_) {
    return arguments.length ? (nodePadding = _, sankey) : nodePadding;
  };

  sankey.size = function(_) {
    return arguments.length ? (size = _, sankey) : size;
  };

  return sankey;
}

function SankeyChart({
  nodes = [],
  links = [],
  title = 'Fluxo de Recursos',
  height = 400,
  onNodeClick,
  formatValue = formatCurrency
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);

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

  // Renderizar Sankey
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0 || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width } = dimensions;
    const margin = { top: 20, right: 120, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Preparar dados
    const graphNodes = nodes.map(n => ({ ...n }));
    const graphLinks = links.map(l => ({ ...l }));

    // Criar layout Sankey
    const sankey = sankeyLayout()
      .nodeWidth(24)
      .nodePadding(16)
      .size([innerWidth, innerHeight]);

    const graph = sankey({ nodes: graphNodes, links: graphLinks });

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Gradientes para links
    const defs = svg.append('defs');

    graph.links.forEach((link, i) => {
      const gradientId = `gradient-${i}`;
      const gradient = defs.append('linearGradient')
        .attr('id', gradientId)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', link.source.x1)
        .attr('x2', link.target.x0);

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', link.source.color || '#94a3b8');

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', link.target.color || '#94a3b8');

      link.gradientId = gradientId;
    });

    // Desenhar links
    const linkGenerator = d3.linkHorizontal()
      .source(d => [d.source.x1, d.y0])
      .target(d => [d.target.x0, d.y1]);

    g.append('g')
      .attr('class', 'links')
      .attr('fill', 'none')
      .selectAll('path')
      .data(graph.links)
      .join('path')
      .attr('d', linkGenerator)
      .attr('stroke', d => `url(#${d.gradientId})`)
      .attr('stroke-width', d => Math.max(2, d.width))
      .attr('stroke-opacity', d => hoveredLink === d ? 0.8 : 0.4)
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        setHoveredLink(d);
      })
      .on('mouseleave', () => {
        setHoveredLink(null);
      });

    // Desenhar nós
    const nodeGroup = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(graph.nodes)
      .join('g')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    nodeGroup.append('rect')
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => Math.max(d.y1 - d.y0, 4))
      .attr('rx', 3)
      .attr('fill', d => d.color || '#6366f1')
      .attr('fill-opacity', d => hoveredNode === d.id ? 1 : 0.9)
      .style('cursor', onNodeClick ? 'pointer' : 'default')
      .on('mouseenter', (event, d) => {
        setHoveredNode(d.id);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      })
      .on('click', (event, d) => {
        if (onNodeClick) onNodeClick(d);
      });

    // Labels dos nós
    nodeGroup.append('text')
      .attr('x', d => d.level === 0 ? -6 : (d.x1 - d.x0) + 6)
      .attr('y', d => (d.y1 - d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.level === 0 ? 'end' : 'start')
      .attr('font-size', '11px')
      .attr('fill', '#374151')
      .text(d => d.name);

    // Valores dos nós
    nodeGroup.append('text')
      .attr('x', d => d.level === 0 ? -6 : (d.x1 - d.x0) + 6)
      .attr('y', d => (d.y1 - d.y0) / 2 + 14)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.level === 0 ? 'end' : 'start')
      .attr('font-size', '10px')
      .attr('fill', '#6b7280')
      .text(d => formatValue(d.value));

  }, [nodes, links, dimensions, height, formatValue, hoveredNode, hoveredLink, onNodeClick]);

  if (nodes.length === 0) {
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

      {/* Tooltip para link */}
      {hoveredLink && (
        <div className="mt-2 text-sm text-dark-600">
          <span>
            <strong>{hoveredLink.source.name}</strong> → <strong>{hoveredLink.target.name}</strong>: {formatValue(hoveredLink.value)}
          </span>
        </div>
      )}
    </div>
  );
}

export default SankeyChart;
