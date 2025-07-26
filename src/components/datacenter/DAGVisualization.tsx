import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDatacenterContext } from '@/context/DatacenterContext';
import { 
    ChevronLeft, 
    ChevronRight, 
    RefreshCw, 
    ShieldAlert, 
    AlertTriangle, 
    Clock, 
    PackageX,
    TrendingDown,
    Activity,
    Timer,
    Gauge,
    ZoomIn,
    ZoomOut,
    Move,
    Maximize2
    } from 'lucide-react';

interface Edge {
source: string;
target: string;
}

interface PortPath {
nodes: string[];
edges: Edge[];
}

interface GraphNode {
id: string;
x: number;
y: number;
cellId: string;
portName: string;
packets_sent: number;
packets_received: number;
link_state: string;

// Enhanced fault injection metrics
packets_dropped_in: number;
packets_dropped_out: number;
packets_delayed_in: number;
packets_delayed_out: number;
fault_injection_active: boolean;
drop_rate: number;
delay_ms: number;

// Performance metrics
heartbeats_sent: number;
heartbeats_received: number;
data_packets_sent: number;
data_packets_received: number;
uptime_seconds: number;
last_activity_ago: number;

// Health indicators
healthScore: number;
dropRate: number;
delayRate: number;
isActivePort: boolean;
}

// Parse the stringified JSON from metrics with better error handling
const parsePortPaths = (portPathsStr: string): PortPath => {
try {
if (!portPathsStr || portPathsStr.trim() === '') {
return { nodes: [], edges: [] };
}

// The string is like: "{'nodes': ['bob:port1', 'alice:port1'], 'edges': [...]}"
// Replace single quotes with double quotes for valid JSON
const jsonStr = portPathsStr.replace(/'/g, '"');
const parsed = JSON.parse(jsonStr);

// Validate the parsed structure
if (!parsed || typeof parsed !== 'object') {
console.warn('Parsed port path is not an object:', parsed);
return { nodes: [], edges: [] };
}

// Ensure nodes and edges are arrays
const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
const edges = Array.isArray(parsed.edges) ? parsed.edges : [];

return { nodes, edges };
} catch (e) {
console.error('Failed to parse port path:', e, 'Input:', portPathsStr);
return { nodes: [], edges: [] };
}
};

export function DAGVisualization() {
const { cells, getMetrics } = useDatacenterContext();
const [selectedCellIndex, setSelectedCellIndex] = useState(0);
const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
const [viewMode, setViewMode] = useState<'normal' | 'faults' | 'performance'>('normal');
const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: Edge[] }>({ nodes: [], links: [] });

const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
const [isPanning, setIsPanning] = useState(false);
const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
const svgRef = useRef<SVGSVGElement>(null);

const cellIds = Object.keys(cells);
const selectedCellId = cellIds[selectedCellIndex];
const selectedCell = selectedCellId ? cells[selectedCellId] : null;

const transformDataToGraph = useCallback((portPaths: Record<string, string>) => {
console.log("Transforming port paths for cell:", selectedCellId, portPaths);

const allNodes = new Map<string, GraphNode>();
const allLinks: Edge[] = [];

// First, add all ports from the selected cell's metrics to ensure we have complete data
if (selectedCell?.metrics?.ports) {
Object.entries(selectedCell.metrics.ports).forEach(([portId, portMetrics]: [string, any]) => {
const [cellId, portName] = portId.split(':');

const totalPackets = (portMetrics?.packets_sent || 0) + (portMetrics?.packets_received || 0);
const totalDropped = (portMetrics?.packets_dropped_in || 0) + (portMetrics?.packets_dropped_out || 0);
const totalDelayed = (portMetrics?.packets_delayed_in || 0) + (portMetrics?.packets_delayed_out || 0);
const totalProcessed = totalPackets + totalDropped;

const dropRate = totalProcessed > 0 ? (totalDropped / totalProcessed) * 100 : 0;
const delayRate = totalPackets > 0 ? (totalDelayed / totalPackets) * 100 : 0;

let healthScore = 100;
if (portMetrics?.link_state !== 'connected') healthScore -= 50;
if (totalPackets === 0 && portMetrics?.link_state === 'connected') healthScore -= 20;
if (portMetrics?.fault_injection_active) {
  healthScore -= Math.min(30, dropRate * 1.5);
}

allNodes.set(portId, {
  id: portId,
  x: 0,
  y: 0,
  cellId,
  portName: portName || '',
  packets_sent: portMetrics?.packets_sent || 0,
  packets_received: portMetrics?.packets_received || 0,
  link_state: portMetrics?.link_state || 'unknown',
  
  packets_dropped_in: portMetrics?.packets_dropped_in || 0,
  packets_dropped_out: portMetrics?.packets_dropped_out || 0,
  packets_delayed_in: portMetrics?.packets_delayed_in || 0,
  packets_delayed_out: portMetrics?.packets_delayed_out || 0,
  fault_injection_active: portMetrics?.fault_injection_active || false,
  drop_rate: (portMetrics?.drop_rate || 0) * 100,
  delay_ms: portMetrics?.delay_ms || 0,
  
  heartbeats_sent: portMetrics?.heartbeats_sent || 0,
  heartbeats_received: portMetrics?.heartbeats_received || 0,
  data_packets_sent: portMetrics?.data_packets_sent || 0,
  data_packets_received: portMetrics?.data_packets_received || 0,
  uptime_seconds: portMetrics?.uptime_seconds || 0,
  last_activity_ago: portMetrics?.last_activity_ago || 0,
  
  healthScore: Math.max(0, Math.round(healthScore)),
  dropRate,
  delayRate,
  isActivePort: totalPackets > 0
});
});
}

// Process port paths if they exist and are valid
if (portPaths && typeof portPaths === 'object') {
Object.entries(portPaths).forEach(([portId, pathStr]) => {
// Skip if pathStr is invalid
if (!pathStr || typeof pathStr !== 'string') {
  console.warn('Invalid port path string for port:', portId, pathStr);
  return;
}

const portPath = parsePortPaths(pathStr);

// Add all nodes from this port path
portPath.nodes.forEach((nodeId, index) => {
  if (!nodeId || typeof nodeId !== 'string' || !nodeId.includes(':')) {
    console.warn('Invalid node ID in port path:', nodeId);
    return;
  }
  
  const [cellId, portName] = nodeId.split(':');
  
  // Only add if not already present from port metrics
  if (!allNodes.has(nodeId)) {
    // Get packet stats from metrics if available
    const portMetrics = cells[cellId]?.metrics?.ports?.[nodeId];
    
    // Calculate health metrics with safer defaults
    const totalPackets = (portMetrics?.packets_sent || 0) + (portMetrics?.packets_received || 0);
    const totalDropped = (portMetrics?.packets_dropped_in || 0) + (portMetrics?.packets_dropped_out || 0);
    const totalDelayed = (portMetrics?.packets_delayed_in || 0) + (portMetrics?.packets_delayed_out || 0);
    const totalProcessed = totalPackets + totalDropped;
    
    const dropRate = totalProcessed > 0 ? (totalDropped / totalProcessed) * 100 : 0;
    const delayRate = totalPackets > 0 ? (totalDelayed / totalPackets) * 100 : 0;
    
    // Calculate health score with defensive programming
    let healthScore = 100;
    if (portMetrics?.link_state !== 'connected') healthScore -= 50;
    if (totalPackets === 0 && portMetrics?.link_state === 'connected') healthScore -= 20;
    if (portMetrics?.fault_injection_active) {
      healthScore -= Math.min(30, dropRate * 1.5);
    }
    
    allNodes.set(nodeId, {
      id: nodeId,
      x: 0, // Will be set later
      y: 0, // Will be set later
      cellId,
      portName: portName || '',
      packets_sent: portMetrics?.packets_sent || 0,
      packets_received: portMetrics?.packets_received || 0,
      link_state: portMetrics?.link_state || 'unknown',
      
      // Fault injection metrics
      packets_dropped_in: portMetrics?.packets_dropped_in || 0,
      packets_dropped_out: portMetrics?.packets_dropped_out || 0,
      packets_delayed_in: portMetrics?.packets_delayed_in || 0,
      packets_delayed_out: portMetrics?.packets_delayed_out || 0,
      fault_injection_active: portMetrics?.fault_injection_active || false,
      drop_rate: (portMetrics?.drop_rate || 0) * 100,
      delay_ms: portMetrics?.delay_ms || 0,
      
      // Performance metrics
      heartbeats_sent: portMetrics?.heartbeats_sent || 0,
      heartbeats_received: portMetrics?.heartbeats_received || 0,
      data_packets_sent: portMetrics?.data_packets_sent || 0,
      data_packets_received: portMetrics?.data_packets_received || 0,
      uptime_seconds: portMetrics?.uptime_seconds || 0,
      last_activity_ago: portMetrics?.last_activity_ago || 0,
      
      // Health indicators
      healthScore: Math.max(0, Math.round(healthScore)),
      dropRate,
      delayRate,
      isActivePort: totalPackets > 0
    });
  }
});

// Add all edges from this port path with validation
portPath.edges.forEach(edge => {
  // Validate edge structure
  if (!edge || !edge.source || !edge.target || 
      typeof edge.source !== 'string' || typeof edge.target !== 'string') {
    console.warn('Invalid edge in port path:', edge);
    return;
  }
  
  // Avoid duplicate links
  const linkExists = allLinks.some(l => 
    (l.source === edge.source && l.target === edge.target) ||
    (l.source === edge.target && l.target === edge.source)
  );
  
  if (!linkExists) {
    allLinks.push({
      source: edge.source,
      target: edge.target
    });
  }
});
});
}

const nodes = Array.from(allNodes.values());

if (nodes.length > 0) {
    if (nodes.length <= 12) {
      // Circle layout for small to medium networks
      nodes.forEach((node, index) => {
        const angle = (index * 2 * Math.PI) / nodes.length;
        const radius = Math.max(180, nodes.length * 45);
        const centerX = 500;
        const centerY = 400;
  
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
      });
    } else if (nodes.length <= 24) {
      // Concentric circles for medium networks
      const innerRadius = 200;
      const outerRadius = 350;
      const innerCount = Math.ceil(nodes.length * 0.4);
      const outerCount = nodes.length - innerCount;
      
      nodes.forEach((node, index) => {
        const centerX = 500;
        const centerY = 400;
        
        if (index < innerCount) {
          // Inner circle
          const angle = (index * 2 * Math.PI) / innerCount;
          node.x = centerX + innerRadius * Math.cos(angle);
          node.y = centerY + innerRadius * Math.sin(angle);
        } else {
          // Outer circle
          const outerIndex = index - innerCount;
          const angle = (outerIndex * 2 * Math.PI) / outerCount;
          node.x = centerX + outerRadius * Math.cos(angle);
          node.y = centerY + outerRadius * Math.sin(angle);
        }
      });
    } else {
      // Force-directed style layout for large networks
      const centerX = 500;
      const centerY = 400;
      const baseRadius = 150;
      const maxRadius = 450;
      
      nodes.forEach((node, index) => {
        // Create clusters in a spiral pattern
        const spiralFactor = index / nodes.length;
        const angle = spiralFactor * 6 * Math.PI; // Multiple rotations
        const radius = baseRadius + (maxRadius - baseRadius) * spiralFactor;
        
        // Add some randomness to avoid perfect spiral
        const randomOffset = (Math.random() - 0.5) * 100;
        const randomAngle = (Math.random() - 0.5) * 0.5;
        
        node.x = centerX + (radius + randomOffset) * Math.cos(angle + randomAngle);
        node.y = centerY + (radius + randomOffset) * Math.sin(angle + randomAngle);
      });
    }
  }
const result = { nodes, links: allLinks };
console.log("Transformed result:", result);
return result;
}, [selectedCellId, cells, selectedCell]);

// Memoize the graph data for the selected cell with better error handling
const memoizedGraphData = useMemo(() => {
try {
// Handle cases where cell or metrics might be undefined
if (!selectedCell) {
console.log('No selected cell available');
return { nodes: [], links: [] };
}

// Check if we have any useful data to display
const hasPortPaths = selectedCell?.metrics?.agent?.port_paths && 
                  Object.keys(selectedCell.metrics.agent.port_paths).length > 0;
const hasPortMetrics = selectedCell?.metrics?.ports && 
                    Object.keys(selectedCell.metrics.ports).length > 0;

if (!hasPortPaths && !hasPortMetrics) {
console.log('No port paths or port metrics available for cell:', selectedCellId);
return { nodes: [], links: [] };
}

console.log("Transforming graph data for cell:", selectedCellId);
console.log("Port paths available:", hasPortPaths);
console.log("Port metrics available:", hasPortMetrics);

// Use port paths if available, otherwise empty object
const portPaths = (hasPortPaths && selectedCell.metrics.agent.port_paths) ? 
               selectedCell.metrics.agent.port_paths : {};

return transformDataToGraph(portPaths);
} catch (error) {
console.error('Error in memoizedGraphData calculation:', error);
// Return a safe fallback
return { nodes: [], links: [] };
}
}, [selectedCell?.metrics?.agent?.port_paths, selectedCell?.metrics?.ports, transformDataToGraph, selectedCellId]);

useEffect(() => {
setGraphData(memoizedGraphData);
}, [memoizedGraphData]);

const handlePrevCell = () => {
setSelectedCellIndex(prev => (prev - 1 + cellIds.length) % cellIds.length);
setSelectedNode(null);
};

const handleNextCell = () => {
setSelectedCellIndex(prev => (prev + 1) % cellIds.length);
setSelectedNode(null);
};

const handleRefreshMetrics = () => {
if (selectedCellId) {
getMetrics(selectedCellId);
}
};

// Get node by ID for link drawing with error handling
const getNodeById = (nodeId: string) => {
if (!nodeId || typeof nodeId !== 'string') {
console.warn('Invalid nodeId provided to getNodeById:', nodeId);
return undefined;
}
return graphData.nodes.find(n => n && n.id === nodeId);
};

// Get node color based on view mode and health
const getNodeColor = (node: GraphNode) => {
switch (viewMode) {
case 'faults':
if (node.fault_injection_active) return '#ef4444'; // Red for fault injection
if (node.dropRate > 0) return '#f97316'; // Orange for drops
return '#10b981'; // Green for normal
case 'performance':
if (node.healthScore >= 80) return '#10b981'; // Green
if (node.healthScore >= 60) return '#f59e0b'; // Yellow
return '#ef4444'; // Red
default:
if (node.link_state === 'connected') return '#10b981';
if (node.link_state === 'disconnected') return '#ef4444';
return '#6b7280';
}
};

// Enhanced mouse event handlers for proper panning
const handleMouseDown = (e: React.MouseEvent) => {
if (e.button === 0) { // Left mouse button only
  e.preventDefault();
  setIsPanning(true);
  
  if (svgRef.current) {
    const rect = svgRef.current.getBoundingClientRect();
    setLastPanPoint({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  }
}
};

const handleMouseMove = (e: React.MouseEvent) => {
if (isPanning && svgRef.current) {
  const rect = svgRef.current.getBoundingClientRect();
  const currentPoint = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  
  const deltaX = currentPoint.x - lastPanPoint.x;
  const deltaY = currentPoint.y - lastPanPoint.y;
  
  setTransform(prev => ({
    ...prev,
    x: prev.x + deltaX,
    y: prev.y + deltaY
  }));
  
  setLastPanPoint(currentPoint);
}
};

const handleMouseUp = () => {
setIsPanning(false);
};

const handleMouseLeave = () => {
setIsPanning(false);
};

// Enhanced wheel handler for zooming
const handleWheel = (e: React.WheelEvent) => {
e.preventDefault();
if (!svgRef.current) return;

const rect = svgRef.current.getBoundingClientRect();
const mouseX = e.clientX - rect.left;
const mouseY = e.clientY - rect.top;

const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
const newScale = Math.max(0.1, Math.min(3, transform.scale * scaleFactor));

// Zoom towards mouse position
const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

setTransform({
  x: newX,
  y: newY,
  scale: newScale
});
};

// Zoom controls
const zoomIn = () => {
setTransform(prev => ({
  ...prev,
  scale: Math.min(3, prev.scale * 1.2)
}));
};

const zoomOut = () => {
setTransform(prev => ({
  ...prev,
  scale: Math.max(0.1, prev.scale * 0.8)
}));
};

const resetView = () => {
setTransform({ x: 0, y: 0, scale: 1 });
};

const fitToView = () => {
if (graphData.nodes.length === 0) return;

// Calculate bounding box of all nodes
const padding = 100;
const minX = Math.min(...graphData.nodes.map(n => n.x)) - padding;
const maxX = Math.max(...graphData.nodes.map(n => n.x)) + padding;
const minY = Math.min(...graphData.nodes.map(n => n.y)) - padding;
const maxY = Math.max(...graphData.nodes.map(n => n.y)) + padding;

const contentWidth = maxX - minX;
const contentHeight = maxY - minY;

// Get SVG dimensions
if (!svgRef.current) return;
const svgRect = svgRef.current.getBoundingClientRect();
const svgWidth = svgRect.width;
const svgHeight = svgRect.height;

// Calculate scale to fit content
const scaleX = svgWidth / contentWidth;
const scaleY = svgHeight / contentHeight;
const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

// Center the content
const centerX = (minX + maxX) / 2;
const centerY = (minY + maxY) / 2;
const translateX = svgWidth / 2 - centerX * scale;
const translateY = svgHeight / 2 - centerY * scale;

setTransform({
  x: translateX,
  y: translateY,
  scale: scale
});
};

// Enhanced node click handler
const handleNodeClick = (node: GraphNode, e: React.MouseEvent) => {
e.stopPropagation();
setSelectedNode(node);
};

// Calculate network statistics
const networkStats = useMemo(() => {
const totalNodes = graphData.nodes.length;
const connectedNodes = graphData.nodes.filter(n => n.link_state === 'connected').length;
const faultInjectionNodes = graphData.nodes.filter(n => n.fault_injection_active).length;
const totalPacketsDropped = graphData.nodes.reduce((sum, n) => sum + n.packets_dropped_in + n.packets_dropped_out, 0);
const totalPacketsDelayed = graphData.nodes.reduce((sum, n) => sum + n.packets_delayed_in + n.packets_delayed_out, 0);
const averageHealth = totalNodes > 0 ? Math.round(graphData.nodes.reduce((sum, n) => sum + n.healthScore, 0) / totalNodes) : 0;

return {
totalNodes,
connectedNodes,
faultInjectionNodes,
totalPacketsDropped,
totalPacketsDelayed,
averageHealth
};
}, [graphData]);

if (cellIds.length === 0) {
return (
<Card className="h-full">
<CardContent className="flex items-center justify-center h-64">
  <div className="text-center text-gray-500">
    <p>No cells available</p>
    <p className="text-sm">Add cells to view topology</p>
  </div>
</CardContent>
</Card>
);
}

return (
<Card className="h-full">
<CardHeader>
<CardTitle className="text-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
  <span className="flex items-center gap-2">
    Network Tree - {selectedCellId}
    {networkStats.faultInjectionNodes > 0 && (
      <Badge variant="destructive" className="text-xs">
        <ShieldAlert className="w-3 h-3 mr-1" />
        {networkStats.faultInjectionNodes} faults
      </Badge>
    )}
  </span>
  <div className="flex items-center gap-2 flex-wrap">
    {/* View Mode Toggle */}
    <div className="flex gap-1">
      <Button
        size="sm"
        variant={viewMode === 'normal' ? 'default' : 'outline'}
        onClick={() => setViewMode('normal')}
        className="text-xs px-2"
      >
        Normal
      </Button>
      <Button
        size="sm"
        variant={viewMode === 'faults' ? 'default' : 'outline'}
        onClick={() => setViewMode('faults')}
        className="text-xs px-2"
      >
        <ShieldAlert className="w-3 h-3 mr-1" />
        Faults
      </Button>
      <Button
        size="sm"
        variant={viewMode === 'performance' ? 'default' : 'outline'}
        onClick={() => setViewMode('performance')}
        className="text-xs px-2"
      >
        <Gauge className="w-3 h-3 mr-1" />
        Health
      </Button>
    </div>
    <div className="flex items-center gap-2 flex-wrap">
    
    
    {/* Zoom Controls */}
    <div className="flex items-center gap-1 border-l pl-2">
      <Button
        size="sm"
        variant="outline"
        onClick={zoomIn}
        title="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={zoomOut}
        title="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={fitToView}
        title="Fit to View"
      >
        <Maximize2 className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={resetView}
        title="Reset View"
      >
        <Move className="w-4 h-4" />
      </Button>
    </div>
    
    {/* Navigation Controls */}
    <div className="flex items-center gap-1 border-l pl-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handlePrevCell}
        disabled={cellIds.length <= 1}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="text-sm bg-gray-100 px-2 py-1 rounded">
        {selectedCellIndex + 1} / {cellIds.length}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={handleNextCell}
        disabled={cellIds.length <= 1}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRefreshMetrics}
      >
        <RefreshCw className="w-4 h-4" />
      </Button>
    </div>
  </div>
    
</div>   
    
</CardTitle>
</CardHeader>
<CardContent>
{/* Network Health Overview */}
<div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
  <div className="bg-blue-50 p-2 rounded">
    <div className="font-medium text-blue-700">Network Health</div>
    <div className={`text-lg font-bold ${
      networkStats.averageHealth >= 80 ? 'text-green-600' : 
      networkStats.averageHealth >= 60 ? 'text-yellow-600' : 'text-red-600'
    }`}>
      {networkStats.averageHealth}%
    </div>
  </div>
  <div className="bg-green-50 p-2 rounded">
    <div className="font-medium text-green-700">Connected</div>
    <div className="text-lg font-bold text-green-600">
      {networkStats.connectedNodes}/{networkStats.totalNodes}
    </div>
  </div>
  <div className="bg-red-50 p-2 rounded">
    <div className="font-medium text-red-700">Packets Dropped</div>
    <div className="text-lg font-bold text-red-600">
      {networkStats.totalPacketsDropped}
    </div>
  </div>
  <div className="bg-orange-50 p-2 rounded">
    <div className="font-medium text-orange-700">Packets Delayed</div>
    <div className="text-lg font-bold text-orange-600">
      {networkStats.totalPacketsDelayed}
    </div>
  </div>
</div>
<div className="mb-2 flex items-center justify-between text-xs text-gray-500">
  <span>Zoom: {Math.round(transform.scale * 100)}% | Pan: ({Math.round(transform.x)}, {Math.round(transform.y)})</span>
  <span className={isPanning ? "text-blue-600" : ""}>
    {isPanning ? "Panning..." : "Click and drag to pan, scroll to zoom"}
  </span>
</div>

{selectedCell?.metrics ? (
  <div className="border rounded p-4 bg-white relative overflow-hidden" style={{ height: '600px' }}>
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      className="w-full h-full select-none"
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
    >
      {/* Apply transform group */}
      <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
      {/* Define arrow markers for links */}
      <defs>
        <marker
          id="arrowhead-connected"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="#10b981"
          />
        </marker>
        
        <marker
          id="arrowhead-disconnected"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="#ef4444"
          />
        </marker>

        <marker
          id="arrowhead-fault"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="#f97316"
          />
        </marker>
      </defs>

      {/* Draw links */}
      {graphData.links.map((link, index) => {
          const sourceNode = getNodeById(link.source);
          const targetNode = getNodeById(link.target);
          
          if (!sourceNode || !targetNode) return null;

        // Determine link state based on both nodes and view mode
        const isConnected = sourceNode.link_state === 'connected' && targetNode.link_state === 'connected';
        const hasFaults = sourceNode.fault_injection_active || targetNode.fault_injection_active;
        
        let linkColor = '#10b981';
        let markerType = 'arrowhead-connected';
        let strokeDasharray = 'none';
        
        if (viewMode === 'faults' && hasFaults) {
          linkColor = '#f97316';
          markerType = 'arrowhead-fault';
          strokeDasharray = '12,4';
        } else if (!isConnected) {
          linkColor = '#ef4444';
          markerType = 'arrowhead-disconnected';
          strokeDasharray = '8,4';
        }

        return (
          <g key={`link-${index}`}>
            {/* Main link line */}
            <line
              x1={sourceNode.x}
              y1={sourceNode.y}
              x2={targetNode.x}
              y2={targetNode.y}
              stroke={linkColor}
              strokeWidth="3"
              strokeDasharray={strokeDasharray}
              markerEnd={`url(#${markerType})`}
              opacity={isConnected ? 1 : 0.6}
            />
            
            {/* Animated packet flow - only for connected links */}
            {isConnected && (
              <>
                <path
                  id={`linkPath-${index}`}
                  d={`M ${sourceNode.x},${sourceNode.y} L ${targetNode.x},${targetNode.y}`}
                  stroke="transparent"
                  fill="none"
                />
                <circle r="4" fill={hasFaults ? "#fbbf24" : "#3b82f6"} opacity="0.8">
                  <animateMotion 
                    dur={hasFaults ? "3s" : "2s"}
                    repeatCount="indefinite"
                    keyPoints="0;1;0"
                    keyTimes="0;0.5;1"
                  >
                    <mpath href={`#linkPath-${index}`}/>
                  </animateMotion>
                </circle>
              </>
            )}
          </g>
        );
      })}

      {/* Draw nodes */}
      {graphData.nodes.map((node) => (
        <g key={node.id} onClick={(e) => handleNodeClick(node, e)} className="cursor-pointer">
          {/* Node circle with enhanced styling */}
          <circle
            cx={node.x}
            cy={node.y}
            r="35"
            fill={getNodeColor(node)}
            stroke={node.fault_injection_active ? "#dc2626" : "#374151"}
            strokeWidth={node.fault_injection_active ? "4" : "2"}
            strokeDasharray={node.fault_injection_active ? "8,4" : "none"}
            className="hover:opacity-80 transition-opacity"
          />
          
          {/* Health score indicator (inner circle) */}
          {viewMode === 'performance' && (
            <circle
              cx={node.x}
              cy={node.y}
              r="28"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeDasharray={`${(node.healthScore / 100) * 175} 175`}
              strokeLinecap="round"
              transform={`rotate(-90 ${node.x} ${node.y})`}
              opacity="0.8"
            />
          )}
          
          {/* Cell name (main label) */}
          <text
            x={node.x}
            y={node.y - 8}
            textAnchor="middle"
            fontSize="12"
            fontWeight="bold"
            fill="white"
          >
            {node.cellId}
          </text>
          
          {/* Port name (secondary label) */}
          <text
            x={node.x}
            y={node.y + 6}
            textAnchor="middle"
            fontSize="9"
            fill="white"
          >
            {node.portName}
          </text>
          
          {/* Health score overlay */}
          {viewMode === 'performance' && (
            <text
              x={node.x}
              y={node.y + 18}
              textAnchor="middle"
              fontSize="8"
              fontWeight="bold"
              fill="white"
            >
              {node.healthScore}%
            </text>
          )}
          
          {/* Full node ID below circle */}
          <text
            x={node.x}
            y={node.y + 55}
            textAnchor="middle"
            fontSize="9"
            fill="#374151"
            fontFamily="monospace"
          >
            {node.id}
          </text>
          
          {/* Fault injection indicators */}
          {node.fault_injection_active && (
            <g>
              {/* Warning icon */}
              <circle
                cx={node.x + 30}
                cy={node.y - 30}
                r="10"
                fill="#dc2626"
                stroke="white"
                strokeWidth="2"
              />
              <text
                x={node.x + 30}
                y={node.y - 26}
                textAnchor="middle"
                fontSize="12"
                fontWeight="bold"
                fill="white"
              >
                !
              </text>
            </g>
          )}
          
          {/* Packet statistics based on view mode */}
          {viewMode === 'faults' && (node.packets_dropped_in > 0 || node.packets_dropped_out > 0) && (
            <g>
              {/* Dropped packets indicator */}
              <circle
                cx={node.x - 30}
                cy={node.y - 30}
                r="12"
                fill="#dc2626"
                stroke="white"
                strokeWidth="1"
              />
              <text
                x={node.x - 30}
                y={node.y - 26}
                textAnchor="middle"
                fontSize="8"
                fontWeight="bold"
                fill="white"
              >
                ✗{node.packets_dropped_in + node.packets_dropped_out}
              </text>
            </g>
          )}
          
          {viewMode === 'normal' && (node.packets_sent > 0 || node.packets_received > 0) && (
            <g>
              {/* Sent packets (top right) */}
              {node.packets_sent > 0 && (
                <>
                  <circle
                    cx={node.x + 30}
                    cy={node.y - 15}
                    r="10"
                    fill="#3b82f6"
                    stroke="white"
                    strokeWidth="1"
                  />
                  <text
                    x={node.x + 30}
                    y={node.y - 11}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="bold"
                    fill="white"
                  >
                    ↗{node.packets_sent}
                  </text>
                </>
              )}
              
              {/* Received packets (bottom right) */}
              {node.packets_received > 0 && (
                <>
                  <circle
                    cx={node.x + 30}
                    cy={node.y + 15}
                    r="10"
                    fill="#10b981"
                    stroke="white"
                    strokeWidth="1"
                  />
                  <text
                    x={node.x + 30}
                    y={node.y + 19}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="bold"
                    fill="white"
                  >
                    ↙{node.packets_received}
                  </text>
                </>
              )}
            </g>
          )}
        </g>
      ))}
      </g>
    </svg>
  </div>
) : (
  <div className="border rounded p-4 bg-gray-50 h-96 flex items-center justify-center">
    <div className="text-center text-gray-500">
      <p>No topology data available for {selectedCellId}</p>
      <p className="text-sm">Cell may not have agent metrics yet</p>
      <Button 
        onClick={handleRefreshMetrics} 
        variant="outline" 
        size="sm" 
        className="mt-2"
      >
        <RefreshCw className="w-4 h-4 mr-1" />
        Refresh Metrics
      </Button>
    </div>
  </div>
)}

{/* Enhanced Stats and Info */}
<div className="mt-4 space-y-3">
  {/* Legend */}
  <div className="flex items-center justify-between text-sm">
    <div className="flex gap-4">
      <span>Nodes: {graphData.nodes.length}</span>
      <span>Links: {graphData.links.length}</span>
      <span>Active: {graphData.nodes.filter(n => n.isActivePort).length}</span>
      {networkStats.faultInjectionNodes > 0 && (
        <span className="text-red-600">Faults: {networkStats.faultInjectionNodes}</span>
      )}
    </div>
    <div className="flex items-center gap-4 text-xs">
      {viewMode === 'normal' && (
        <>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Connected</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Disconnected</span>
          </div>
        </>
      )}
      {viewMode === 'faults' && (
        <>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Fault Active</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span>Packet Loss</span>
          </div>
        </>
      )}
      {viewMode === 'performance' && (
        <>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Healthy (&gt;80%)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Warning (60-80%)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Critical (&lt;60%)</span>
          </div>
        </>
      )}
    </div>
  </div>

  {/* Selected Node Details */}
  {selectedNode && (
    <div className="bg-blue-50 p-3 rounded text-sm">
      <div className="font-medium mb-2 flex items-center gap-2">
        <Activity className="w-4 h-4" />
        Node Details: {selectedNode.id}
        {selectedNode.fault_injection_active && (
          <Badge variant="destructive" className="text-xs">
            <ShieldAlert className="w-3 h-3 mr-1" />
            Fault Injection Active
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="font-medium">Health Score:</div>
          <div className={`font-bold ${
            selectedNode.healthScore >= 80 ? 'text-green-600' : 
            selectedNode.healthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {selectedNode.healthScore}%
          </div>
        </div>
        <div>
          <div className="font-medium">Link State:</div>
          <div className={selectedNode.link_state === 'connected' ? 'text-green-600' : 'text-red-600'}>
            {selectedNode.link_state}
          </div>
        </div>
        <div>
          <div className="font-medium">Packets Sent:</div>
          <div className="text-blue-600">{selectedNode.packets_sent}</div>
        </div>
        <div>
          <div className="font-medium">Packets Received:</div>
          <div className="text-green-600">{selectedNode.packets_received}</div>
        </div>
      </div>
      
      {selectedNode.fault_injection_active && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="font-medium mb-2 text-red-700">Fault Injection Details</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="font-medium">Drop Rate:</div>
              <div className="text-red-600">{selectedNode.drop_rate}%</div>
            </div>
            <div>
              <div className="font-medium">Delay:</div>
              <div className="text-orange-600">{selectedNode.delay_ms}ms</div>
            </div>
            <div>
              <div className="font-medium">Dropped In/Out:</div>
              <div className="text-red-600">{selectedNode.packets_dropped_in}/{selectedNode.packets_dropped_out}</div>
            </div>
            <div>
              <div className="font-medium">Delayed In/Out:</div>
              <div className="text-orange-600">{selectedNode.packets_delayed_in}/{selectedNode.packets_delayed_out}</div>
            </div>
          </div>
        </div>
      )}
      
      <div className="mt-3 pt-3 border-t border-blue-200">
        <div className="font-medium mb-2">Performance Metrics</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="font-medium">Uptime:</div>
            <div>{selectedNode.uptime_seconds.toFixed(1)}s</div>
          </div>
          <div>
            <div className="font-medium">Last Activity:</div>
            <div>{selectedNode.last_activity_ago < 1 ? 'Recent' : `${selectedNode.last_activity_ago.toFixed(1)}s ago`}</div>
          </div>
          <div>
            <div className="font-medium">Heartbeats:</div>
            <div>{selectedNode.heartbeats_sent}/{selectedNode.heartbeats_received}</div>
          </div>
          <div>
            <div className="font-medium">Data Packets:</div>
            <div>{selectedNode.data_packets_sent}/{selectedNode.data_packets_received}</div>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* Agent Information */}
  {selectedCell?.metrics?.agent && (
    <div className="bg-purple-50 p-3 rounded text-sm">
      <div className="font-medium mb-2 flex items-center gap-2">
        <Activity className="w-4 h-4" />
        Agent Status
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="font-medium">Status:</div>
          <div>{selectedCell.metrics.agent.status}</div>
        </div>
        <div>
          <div className="font-medium">Trees Count:</div>
          <div>{selectedCell.metrics.agent.trees_count}</div>
        </div>
        <div>
          <div className="font-medium">Node ID:</div>
          <div className="font-mono text-xs">{selectedCell.metrics.agent.node_id}</div>
        </div>
        <div>
          <div className="font-medium">Leafward Connections:</div>
          <div>{selectedCell.metrics.agent.total_leafward_connections}</div>
        </div>
      </div>
    </div>
  )}

  {/* Critical Issues Alert */}
  {(networkStats.totalPacketsDropped > 10 || networkStats.faultInjectionNodes > networkStats.totalNodes * 0.5) && (
    <div className="bg-red-50 border border-red-200 p-3 rounded text-sm">
      <div className="flex items-center gap-2 font-medium text-red-700 mb-2">
        <AlertTriangle className="w-4 h-4" />
        Network Issues Detected
      </div>
      <div className="text-red-600">
        {networkStats.totalPacketsDropped > 10 && `• High packet loss detected (${networkStats.totalPacketsDropped} packets dropped)`}
        {networkStats.faultInjectionNodes > networkStats.totalNodes * 0.5 && `• Widespread fault injection active on ${networkStats.faultInjectionNodes} nodes`}
        {networkStats.averageHealth < 60 && `• Low network health score (${networkStats.averageHealth}%)`}
      </div>
    </div>
  )}
</div>
</CardContent>
</Card>
);
}