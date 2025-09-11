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
    Activity,
    ZoomIn,
    ZoomOut,
    Move,
    Maximize2,
    GitBranch,
    Route,
    Clock,
    Network
} from 'lucide-react';

interface CellMetrics {
  cell_id: string;
  uptime: number;
  ports: Record<string, PortMetrics>;
  agent: AgentMetrics;
}

interface PortMetrics {
  name: string;
  port_id: string;
  status: string;
  packets_sent: number;
  packets_received: number;
  bytes_sent: number;
  bytes_received: number;
  link_state: string;
  packets_dropped_in: number;
  packets_dropped_out: number;
  packets_delayed_in: number;
  packets_delayed_out: number;
  heartbeats_sent: number;
  heartbeats_received: number;
  uptime_seconds: number;
  last_activity_ago: number;
  fault_injection_active: boolean;
  delay_ms: number;
  neighbor_portid?: string;
}

interface AgentMetrics {
  node_id: string;
  timestamp: number;
  trees: Record<string, TreeInfo>;
  direct_neighbors: string[];
  routing_table: Record<string, RoutingInfo>;
  connected_ports: string[];
}

interface TreeInfo {
  root_id: string;
  hops_to_root: number;
  parent_port: string;
  child_ports: string[];
  is_root: boolean;
  instance_id: string;
}

interface RoutingInfo {
  next_hop_port: string;
  hops: number;
  via_tree: string;
}

interface RouteNode {
  id: string;
  name: string;
  x: number;
  y: number;
  hops: number;
  nextHopPort: string;
  viaTree: string;
  isCurrentCell: boolean;
  isDirect: boolean;
  isRoot: boolean;
}

interface RouteConnection {
  source: string;
  target: string;
  port: string;
  hops: number;
}

interface RoutingEntry {
  destination: string;
  nextHopPort: string;
  hops: number;
  viaTree: string;
  isDirectNeighbor: boolean;
}

export function DAGVisualization() {
  const { cells, getMetrics } = useDatacenterContext();
  const [selectedCellIndex, setSelectedCellIndex] = useState(0);
  const [displayMode, setDisplayMode] = useState<'dag' | 'routing-table'>('dag');
  const [routeData, setRouteData] = useState<{ nodes: RouteNode[], connections: RouteConnection[] }>({ nodes: [], connections: [] });
  const [routingData, setRoutingData] = useState<RoutingEntry[]>([]);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const cellIds = Object.keys(cells);
  const selectedCellId = cellIds[selectedCellIndex];
  const selectedCell = selectedCellId ? cells[selectedCellId] : null;

  // Transform routing data into hierarchical hop-based layout
  const transformToRouteDAG = useCallback((cellId: string) => {
    const cellData = cells[cellId];
    if (!cellData?.metrics?.agent) {
      return { nodes: [], connections: [] };
    }

    const metrics = cellData.metrics as CellMetrics;
    const agent = metrics.agent;
    const routingTable = agent.routing_table;
    const directNeighbors = new Set(agent.direct_neighbors);
    const ports = metrics.ports;
    
    const centerX = 400;
    const centerY = 300;
    const layerSpacing = 180; // Increased spacing for better port label visibility
    const nodeSpacing = 100;
    
    // Create current cell at center
    const nodes: RouteNode[] = [{
      id: cellId,
      name: cellId,
      x: centerX,
      y: centerY,
      hops: 0,
      nextHopPort: '',
      viaTree: '',
      isCurrentCell: true,
      isDirect: false,
      isRoot: false
    }];

    // Group destinations by hop count
    const destinationsByHops = new Map<number, string[]>();
    
    Object.entries(routingTable).forEach(([destination, routeInfo]) => {
      const hops = routeInfo.hops;
      if (!destinationsByHops.has(hops)) {
        destinationsByHops.set(hops, []);
      }
      destinationsByHops.get(hops)!.push(destination);
    });

    // Add tree information to determine which nodes are roots
    const rootNodes = new Set();
    Object.entries(agent.trees).forEach(([treeId, treeInfo]) => {
      if (treeInfo.is_root && treeId !== cellId) {
        rootNodes.add(treeId);
      }
    });

    const connections: RouteConnection[] = [];

    // Position nodes by hop layers
    Array.from(destinationsByHops.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([hopCount, destinations]) => {
        if (hopCount === 0) return; // Skip self
        
        const radius = layerSpacing * hopCount;
        const angleStep = (2 * Math.PI) / destinations.length;
        
        destinations.forEach((destination, index) => {
          const routeInfo = routingTable[destination];
          const angle = index * angleStep;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          
          // For tree name, use actual tree name if it's different from destination
          let treeName = '';
          if (routeInfo.via_tree !== destination) {
            treeName = routeInfo.via_tree;
          }
          
          nodes.push({
            id: destination,
            name: destination,
            x,
            y,
            hops: hopCount,
            nextHopPort: routeInfo.next_hop_port,
            viaTree: treeName,
            isCurrentCell: false,
            isDirect: directNeighbors.has(destination),
            isRoot: rootNodes.has(destination)
          });

          // Create connection showing routing path with port details
          let portLabel = routeInfo.next_hop_port;
          
          // For direct connections, try to get both port names
          if (hopCount === 1) {
            const currentPort = Object.values(ports).find(port => 
              port.neighbor_portid && port.neighbor_portid.startsWith(destination + ':')
            );
            if (currentPort && currentPort.neighbor_portid) {
              const [, neighborPortName] = currentPort.neighbor_portid.split(':');
              portLabel = `${currentPort.name} ↔ ${neighborPortName}`;
            }
          }

          connections.push({
            source: cellId,
            target: destination,
            port: portLabel,
            hops: hopCount
          });
        });
      });

    return { nodes, connections };
  }, [cells]);

  // Extract routing table data
  const extractRoutingData = useCallback((cellId: string): RoutingEntry[] => {
    const cellData = cells[cellId];
    if (!cellData?.metrics?.agent?.routing_table) {
      return [];
    }

    const metrics = cellData.metrics as CellMetrics;
    const routingTable = metrics.agent.routing_table;
    const directNeighbors = new Set(metrics.agent.direct_neighbors);

    return Object.entries(routingTable).map(([destination, routingInfo]) => ({
      destination,
      nextHopPort: routingInfo.next_hop_port,
      hops: routingInfo.hops,
      viaTree: routingInfo.via_tree,
      isDirectNeighbor: directNeighbors.has(destination)
    })).sort((a, b) => a.hops - b.hops);
  }, [cells]);

  // Update data when selected cell changes
  useEffect(() => {
    if (selectedCellId) {
      if (displayMode === 'dag') {
        const newRouteData = transformToRouteDAG(selectedCellId);
        setRouteData(newRouteData);
      } else {
        const newRoutingData = extractRoutingData(selectedCellId);
        setRoutingData(newRoutingData);
      }
    }
  }, [selectedCellId, displayMode, transformToRouteDAG, extractRoutingData]);

  // Calculate health metrics
  const healthMetrics = useMemo(() => {
    if (!selectedCell?.metrics) return null;

    const metrics = selectedCell.metrics as CellMetrics;
    const ports = Object.values(metrics.ports);
    
    const totalPacketsSent = ports.reduce((sum, p) => sum + p.packets_sent, 0);
    const totalPacketsReceived = ports.reduce((sum, p) => sum + p.packets_received, 0);
    const totalPacketsDropped = ports.reduce((sum, p) => sum + p.packets_dropped_in + p.packets_dropped_out, 0);
    const totalPacketsDelayed = ports.reduce((sum, p) => sum + p.packets_delayed_in + p.packets_delayed_out, 0);
    const faultInjectionActive = ports.some(p => p.fault_injection_active);
    const connectedPorts = ports.filter(p => p.link_state === 'connected').length;

    // Calculate health score
    const connectionHealth = ports.length > 0 ? (connectedPorts / ports.length) * 100 : 0;
    const totalPackets = totalPacketsSent + totalPacketsReceived;
    const dropRate = totalPackets > 0 ? (totalPacketsDropped / (totalPackets + totalPacketsDropped)) * 100 : 0;
    const healthScore = Math.max(0, Math.round(
      connectionHealth * 0.4 + 
      Math.max(0, 100 - dropRate * 2) * 0.4 + 
      (faultInjectionActive ? 0 : 20)
    ));

    return {
      totalPacketsSent,
      totalPacketsReceived,
      totalPacketsDropped,
      totalPacketsDelayed,
      faultInjectionActive,
      connectedPorts,
      totalPorts: ports.length,
      healthScore,
      uptime: metrics.uptime,
      directNeighbors: metrics.agent?.direct_neighbors?.length || 0,
      treeCount: Object.keys(metrics.agent?.trees || {}).length,
      reachableNodes: Object.keys(metrics.agent?.routing_table || {}).length
    };
  }, [selectedCell]);

  const handlePrevCell = () => {
    setSelectedCellIndex(prev => (prev - 1 + cellIds.length) % cellIds.length);
  };

  const handleNextCell = () => {
    setSelectedCellIndex(prev => (prev + 1) % cellIds.length);
  };

  const handleRefreshMetrics = () => {
    if (selectedCellId) {
      getMetrics(selectedCellId);
    }
  };

  // Mouse event handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(3, transform.scale * scaleFactor));

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
    if (routeData.nodes.length === 0) return;

    const padding = 100;
    const minX = Math.min(...routeData.nodes.map(n => n.x)) - padding;
    const maxX = Math.max(...routeData.nodes.map(n => n.x)) + padding;
    const minY = Math.min(...routeData.nodes.map(n => n.y)) - padding;
    const maxY = Math.max(...routeData.nodes.map(n => n.y)) + padding;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    if (!svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;

    const scaleX = svgWidth / contentWidth;
    const scaleY = svgHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1);

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

  if (cellIds.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-gray-500">
            <p>No cells available</p>
            <p className="text-sm">Add cells to view routing topology</p>
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
            {displayMode === 'dag' ? (
              <>
                <GitBranch className="w-5 h-5" />
                Routing DAG: {selectedCellId}
              </>
            ) : (
              <>
                <Route className="w-5 h-5" />
                Routing Table: {selectedCellId}
              </>
            )}

        {/* Legend - separate from visualization */}
            {healthMetrics?.faultInjectionActive && (
              <Badge variant="destructive" className="text-xs">
                <ShieldAlert className="w-3 h-3 mr-1" />
                Fault Injection Active
              </Badge>
            )}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Display Mode Toggle */}
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={displayMode === 'dag' ? 'default' : 'outline'}
                onClick={() => setDisplayMode('dag')}
                className="text-xs px-2"
              >
                <GitBranch className="w-3 h-3 mr-1" />
                DAG
              </Button>
              <Button
                size="sm"
                variant={displayMode === 'routing-table' ? 'default' : 'outline'}
                onClick={() => setDisplayMode('routing-table')}
                className="text-xs px-2"
              >
                <Route className="w-3 h-3 mr-1" />
                Routes
              </Button>
            </div>
            
            {/* Zoom Controls - only for DAG view */}
            {displayMode === 'dag' && (
              <div className="flex items-center gap-1 border-l pl-2">
                <Button size="sm" variant="outline" onClick={zoomIn} title="Zoom In">
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={zoomOut} title="Zoom Out">
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={fitToView} title="Fit to View">
                  <Maximize2 className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={resetView} title="Reset View">
                  <Move className="w-4 h-4" />
                </Button>
              </div>
            )}
            
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
              <Button size="sm" variant="outline" onClick={handleRefreshMetrics}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Health Overview */}
        {healthMetrics && (
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
            <div className="bg-blue-50 p-2 rounded">
              <div className="font-medium text-blue-700">Health Score</div>
              <div className={`text-lg font-bold ${
                healthMetrics.healthScore >= 80 ? 'text-green-600' : 
                healthMetrics.healthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {healthMetrics.healthScore}%
              </div>
            </div>
            <div className="bg-green-50 p-2 rounded">
              <div className="font-medium text-green-700">Connected Ports</div>
              <div className="text-lg font-bold text-green-600">
                {healthMetrics.connectedPorts}/{healthMetrics.totalPorts}
              </div>
            </div>
            <div className="bg-purple-50 p-2 rounded">
              <div className="font-medium text-purple-700">Trees</div>
              <div className="text-lg font-bold text-purple-600">
                {healthMetrics.treeCount}
              </div>
            </div>
            <div className="bg-orange-50 p-2 rounded">
              <div className="font-medium text-orange-700">Reachable</div>
              <div className="text-lg font-bold text-orange-600">
                {healthMetrics.reachableNodes}
              </div>
            </div>
            <div className="bg-red-50 p-2 rounded">
              <div className="font-medium text-red-700">Packets Dropped</div>
              <div className="text-lg font-bold text-red-600">
                {healthMetrics.totalPacketsDropped}
              </div>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <div className="font-medium text-yellow-700">Uptime</div>
              <div className="text-lg font-bold text-yellow-600">
                {Math.round(healthMetrics.uptime)}s
              </div>
            </div>
          </div>
        )}

        {/* Main content area */}
        {displayMode === 'routing-table' ? (
          <div className="border rounded p-4 bg-white overflow-auto" style={{ height: '600px' }}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Routing Table for {selectedCellId}</h3>
              <div className="text-sm text-gray-600 mb-4">
                This table shows how {selectedCellId} routes packets to reach other cells organized by hop distance.
              </div>
              
              {routingData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No routing data available</p>
                  <p className="text-sm">Ensure the cell has metrics with agent routing information</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border p-2 text-left">Destination</th>
                        <th className="border p-2 text-left">Next Hop Port</th>
                        <th className="border p-2 text-left">Hops</th>
                        <th className="border p-2 text-left">Via Tree</th>
                        <th className="border p-2 text-left">Type</th>
                        <th className="border p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routingData.map((entry, index) => {
                        const isSelf = entry.destination === selectedCellId;
                        
                        return (
                          <tr key={index} className={`${
                            isSelf ? 'bg-purple-50' : 
                            entry.isDirectNeighbor ? 'bg-green-50' : 
                            'bg-white'
                          } hover:bg-gray-50`}>
                            <td className="border p-2 font-medium">
                              {entry.destination}
                              {isSelf && <span className="ml-2 text-xs text-purple-600">(self)</span>}
                            </td>
                            <td className="border p-2 font-mono text-xs">
                              {entry.nextHopPort}
                            </td>
                            <td className="border p-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                entry.hops === 0 ? 'bg-purple-100 text-purple-700' :
                                entry.hops === 1 ? 'bg-green-100 text-green-700' :
                                entry.hops <= 3 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {entry.hops}
                              </span>
                            </td>
                            <td className="border p-2">
                              <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                                {entry.viaTree}
                              </span>
                            </td>
                            <td className="border p-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                entry.isDirectNeighbor ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                              }`}>
                                {entry.isDirectNeighbor ? 'Direct' : 'Indirect'}
                              </span>
                            </td>
                            <td className="border p-2">
                              <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                                Reachable
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="border rounded p-4 bg-white relative overflow-hidden" style={{ height: '600px' }}>
            {/* Navigation info */}
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span>Zoom: {Math.round(transform.scale * 100)}% | Pan: ({Math.round(transform.x)}, {Math.round(transform.y)})</span>
              <span className={isPanning ? "text-blue-600" : ""}>
                {isPanning ? "Panning..." : "Nodes organized by hop distance from current cell"}
              </span>
            </div>

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
              <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                {/* Define arrow markers */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6" />
                  </marker>
                  <marker
                    id="arrowhead-direct"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
                  </marker>
                </defs>

                {/* Draw hop level indicators (circles) */}
                {[1, 2, 3, 4].map(hopLevel => {
                  const radius = 120 * hopLevel;
                  const hasNodesAtLevel = routeData.nodes.some(n => n.hops === hopLevel);
                  
                  if (!hasNodesAtLevel) return null;
                  
                  return (
                    <circle
                      key={`hop-${hopLevel}`}
                      cx={400}
                      cy={300}
                      r={radius}
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="1"
                      strokeDasharray="5,5"
                      opacity="0.5"
                    />
                  );
                })}

                {/* Draw routing connections */}
                {routeData.connections.map((connection, index) => {
                  const sourceNode = routeData.nodes.find(n => n.id === connection.source);
                  const targetNode = routeData.nodes.find(n => n.id === connection.target);
                  
                  if (!sourceNode || !targetNode) return null;

                  const isDirect = connection.hops === 1;
                  const strokeColor = isDirect ? '#10b981' : '#8b5cf6';
                  const markerType = isDirect ? 'arrowhead-direct' : 'arrowhead';
                  const strokeWidth = isDirect ? '3' : '2';
                  const opacity = isDirect ? '1' : '0.7';

                  return (
                    <g key={`connection-${index}`}>
                      <line
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        markerEnd={`url(#${markerType})`}
                        opacity={opacity}
                      />
                      
                      {/* Port label for direct connections */}
                      {isDirect && (
                        <text
                          x={(sourceNode.x + targetNode.x) / 2}
                          y={(sourceNode.y + targetNode.y) / 2 - 20}
                          textAnchor="middle"
                          fontSize="12"
                          fill={strokeColor}
                          fontWeight="bold"
                          stroke="white"
                          strokeWidth="4"
                          paintOrder="stroke fill"
                        >
                          {connection.port}
                        </text>
                      )}
                      
                      {/* Hop count label for multi-hop routes */}
                      {!isDirect && (
                        <text
                          x={(sourceNode.x + targetNode.x) / 2}
                          y={(sourceNode.y + targetNode.y) / 2 - 15}
                          textAnchor="middle"
                          fontSize="11"
                          fill={strokeColor}
                          fontWeight="bold"
                          stroke="white"
                          strokeWidth="3"
                          paintOrder="stroke fill"
                          opacity="0.9"
                        >
                          {connection.hops} hop{connection.hops > 1 ? 's' : ''}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Draw nodes */}
                {routeData.nodes.map((node) => (
                  <g key={node.id}>
                    {/* Node circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.isCurrentCell ? "50" : node.isRoot ? "35" : "30"}
                      fill={
                        node.isCurrentCell ? "#3b82f6" :
                        node.isRoot ? "#8b5cf6" :
                        node.isDirect ? "#10b981" : "#a78bfa"
                      }
                      stroke={node.isCurrentCell ? "#1d4ed8" : "#374151"}
                      strokeWidth={node.isCurrentCell ? "3" : "2"}
                    />
                    
                    {/* Node name */}
                    <text
                      x={node.x}
                      y={node.y - 5}
                      textAnchor="middle"
                      fontSize={node.isCurrentCell ? "14" : "11"}
                      fontWeight="bold"
                      fill="white"
                    >
                      {node.name}
                    </text>
                    
                    {/* Node type */}
                    <text
                      x={node.x}
                      y={node.y + 8}
                      textAnchor="middle"
                      fontSize={node.isCurrentCell ? "10" : "8"}
                      fill="white"
                    >
                      {node.isCurrentCell ? 'CURRENT' : 
                       node.isRoot ? 'ROOT' :
                       node.isDirect ? 'DIRECT' : 'INDIRECT'}
                    </text>
                    
                    {/* Hop count */}
                    <text
                      x={node.x}
                      y={node.y + (node.isCurrentCell ? 65 : node.isRoot ? 50 : 45)}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#6b7280"
                      fontWeight="bold"
                    >
                      {node.hops === 0 ? 'SOURCE' : `${node.hops} ${node.hops === 1 ? 'hop' : 'hops'}`}
                    </text>
                    
                    {/* Tree indicator - only show if it's routing via a different tree */}
                    {node.viaTree && node.viaTree !== node.id && !node.isCurrentCell && (
                      <text
                        x={node.x}
                        y={node.y + (node.isCurrentCell ? 80 : node.isRoot ? 65 : 60)}
                        textAnchor="middle"
                        fontSize="8"
                        fill="#6b7280"
                        fontWeight="medium"
                      >
                        tree: {node.viaTree}
                      </text>
                    )}
                  </g>
                ))}

                {/* Legend - positioned in bottom right */}
              </g>
            </svg>
          </div>
        )}

        {/* Routing Summary */}
        {selectedCell?.metrics && displayMode === 'dag' && (
          <div className="mt-4 bg-blue-50 p-3 rounded text-sm">
            <div className="font-medium mb-2 flex items-center gap-2">
              <Network className="w-4 h-4" />
              Routing Summary: {selectedCellId}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="font-medium mb-1">Direct Neighbors:</div>
                <div className="space-y-1">
                  {routeData.nodes
                    .filter(n => n.isDirect)
                    .map(node => (
                      <div key={node.id} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                        {node.name}: {routeData.connections.find(c => c.target === node.id)?.port || node.nextHopPort}
                      </div>
                    ))}
                </div>
              </div>
              
              <div>
                <div className="font-medium mb-1">Tree Roots:</div>
                <div className="space-y-1">
                  {routeData.nodes
                    .filter(n => n.isRoot && !n.isCurrentCell)
                    .map(node => (
                      <div key={node.id} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                        {node.name} ({node.hops} hops)
                      </div>
                    ))}
                </div>
              </div>
              
              <div>
                <div className="font-medium mb-1">Hop Distribution:</div>
                <div className="space-y-1">
                  {[1, 2, 3, 4, 5].map(hopCount => {
                    const count = routeData.nodes.filter(n => n.hops === hopCount).length;
                    if (count === 0) return null;
                    return (
                      <div key={hopCount} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {count} nodes at {hopCount} hop{hopCount > 1 ? 's' : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Critical Issues Alert */}
        {healthMetrics && (healthMetrics.totalPacketsDropped > 5 || healthMetrics.faultInjectionActive || healthMetrics.healthScore < 60) && (
          <div className="mt-4 bg-red-50 border border-red-200 p-3 rounded text-sm">
            <div className="flex items-center gap-2 font-medium text-red-700 mb-2">
              <AlertTriangle className="w-4 h-4" />
              Cell Issues Detected
            </div>
            <div className="text-red-600">
              {healthMetrics.totalPacketsDropped > 5 && `• Packet loss detected (${healthMetrics.totalPacketsDropped} packets dropped)`}
              {healthMetrics.totalPacketsDelayed > 0 && `• Packet delays detected (${healthMetrics.totalPacketsDelayed} packets delayed)`}
              {healthMetrics.faultInjectionActive && `• Fault injection is currently active`}
              {healthMetrics.healthScore < 60 && `• Low health score (${healthMetrics.healthScore}%)`}
              {healthMetrics.connectedPorts < healthMetrics.totalPorts && `• Some ports disconnected (${healthMetrics.totalPorts - healthMetrics.connectedPorts} offline)`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}