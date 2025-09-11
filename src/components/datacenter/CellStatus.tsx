import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Server, 
  CheckCircle, 
  AlertTriangle, 
  Activity, 
  Trash2, 
  BarChart3,
  Network,
  Zap,
  Clock,
  TrendingUp,
  AlertCircle,
  Shield,
  ShieldAlert,
  Timer,
  PackageX,
  TrendingDown,
  Gauge,
  Eye,
  EyeOff
} from 'lucide-react';
import { useDatacenterContext } from '@/context/DatacenterContext';
import { Cell } from '@/types/datacenter';

interface CellStatusProps {
  cellId: string;
  cell: Cell;
}

interface PortAnalysis {
  totalPackets: number;
  packetsPerSecond: number;
  isActive: boolean;
  healthScore: number;
  lastActivity: string;
  
  // New fault injection metrics
  totalDropped: number;
  totalDelayed: number;
  dropRate: number;
  delayRate: number;
  faultInjectionActive: boolean;
  configuredDropRate: number;
  configuredDelayMs: number;
  
  // Performance metrics
  heartbeatsSent: number;
  heartbeatsReceived: number;
  dataPacketsSent: number;
  dataPacketsReceived: number;
  uptimeSeconds: number;
  lastActivityAgo: number;
}

interface CellAnalysis {
  totalPorts: number;
  activePorts: number;
  connectedPorts: number;
  totalPacketsSent: number;
  totalPacketsReceived: number;
  averagePacketsPerSecond: number;
  healthScore: number;
  treeCount: number;
  leafwardConnections: number;
  
  // New fault injection analysis
  faultInjectionPorts: number;
  totalPacketsDropped: number;
  totalPacketsDelayed: number;
  overallDropRate: number;
  overallDelayRate: number;
  faultImpactScore: number; // How much faults are affecting performance
}

export function CellStatus({ cellId, cell }: CellStatusProps) {
  const { removeCell, getMetrics } = useDatacenterContext();
  const [activeTab, setActiveTab] = useState<'overview' | 'ports' | 'faults' | 'agent' | 'analysis' | 'raw'>('overview');

  // Calculate port-level analysis with fault injection metrics
  const portAnalysis = useMemo((): Record<string, PortAnalysis> => {
    const analysis: Record<string, PortAnalysis> = {};
    
    if (cell.metrics?.ports) {
      Object.entries(cell.metrics.ports).forEach(([portId, port]: [string, any]) => {
        const totalPackets = (port.packets_sent || 0) + (port.packets_received || 0);
        const isConnected = port.link_state === 'connected';
        const isActive = totalPackets > 0;
        
        // Fault injection metrics
        const packetsDroppedIn = port.packets_dropped_in || 0;
        const packetsDroppedOut = port.packets_dropped_out || 0;
        const packetsDelayedIn = port.packets_delayed_in || 0;
        const packetsDelayedOut = port.packets_delayed_out || 0;
        const totalDropped = packetsDroppedIn + packetsDroppedOut;
        const totalDelayed = packetsDelayedIn + packetsDelayedOut;
        
        const totalProcessed = totalPackets + totalDropped;
        const dropRate = totalProcessed > 0 ? (totalDropped / totalProcessed) * 100 : 0;
        const delayRate = totalPackets > 0 ? (totalDelayed / totalPackets) * 100 : 0;
        
        // Health score calculation including fault impact
        let healthScore = 100;
        if (!isConnected) healthScore -= 50;
        if (!isActive && isConnected) healthScore -= 20;
        if (port.fault_injection_active) {
          healthScore -= Math.min(30, dropRate * 1.5); // Cap fault penalty at 30
        }
        
        analysis[portId] = {
          totalPackets,
          packetsPerSecond: totalPackets / Math.max(1, port.uptime_seconds || 60),
          isActive,
          healthScore: Math.max(0, Math.round(healthScore)),
          lastActivity: port.last_activity_ago < 1 ? 'Recent' : `${port.last_activity_ago?.toFixed(1)}s ago`,
          
          // Fault injection metrics
          totalDropped,
          totalDelayed,
          dropRate,
          delayRate,
          faultInjectionActive: port.fault_injection_active || false,
          configuredDropRate: (port.drop_rate || 0) * 100,
          configuredDelayMs: port.delay_ms || 0,
          
          // Performance metrics
          heartbeatsSent: port.heartbeats_sent || 0,
          heartbeatsReceived: port.heartbeats_received || 0,
          dataPacketsSent: port.data_packets_sent || 0,
          dataPacketsReceived: port.data_packets_received || 0,
          uptimeSeconds: port.uptime_seconds || 0,
          lastActivityAgo: port.last_activity_ago || 0
        };
      });
    }
    
    return analysis;
  }, [cell.metrics?.ports]);

  // Calculate cell-level analysis with fault injection
  const cellAnalysis = useMemo((): CellAnalysis => {
    const ports = cell.metrics?.ports || {};
    const agent = cell.metrics?.agent || {};
    
    const totalPorts = Object.keys(ports).length;
    const connectedPorts = Object.values(ports).filter((p: any) => p.link_state === 'connected').length;
    const activePorts = Object.keys(portAnalysis).filter(portId => portAnalysis[portId].isActive).length;
    
    const totalPacketsSent = Object.values(ports).reduce((sum: number, port: any) => 
      sum + (port.packets_sent || 0), 0);
    const totalPacketsReceived = Object.values(ports).reduce((sum: number, port: any) => 
      sum + (port.packets_received || 0), 0);
    
    const totalPackets = totalPacketsSent + totalPacketsReceived;
    const averagePacketsPerSecond = totalPackets / Math.max(1, 60);
    
    // Fault injection analysis
    const faultInjectionPorts = Object.values(portAnalysis).filter(p => p.faultInjectionActive).length;
    const totalPacketsDropped = Object.values(portAnalysis).reduce((sum, p) => sum + p.totalDropped, 0);
    const totalPacketsDelayed = Object.values(portAnalysis).reduce((sum, p) => sum + p.totalDelayed, 0);
    
    const totalProcessedPackets = totalPackets + totalPacketsDropped;
    const overallDropRate = totalProcessedPackets > 0 ? (totalPacketsDropped / totalProcessedPackets) * 100 : 0;
    const overallDelayRate = totalPackets > 0 ? (totalPacketsDelayed / totalPackets) * 100 : 0;
    
    // Fault impact score (0-100, higher means more impact)
    let faultImpactScore = 0;
    if (faultInjectionPorts > 0) {
      faultImpactScore = Math.min(100, overallDropRate * 2 + overallDelayRate * 0.5);
    }
    
    // Overall health score
    let healthScore = 100;
    if (cell.status !== 'alive') healthScore -= 60;
    if (connectedPorts === 0 && totalPorts > 0) healthScore -= 30;
    if (totalPorts > 0) {
      const connectionRatio = connectedPorts / totalPorts;
      healthScore = healthScore * connectionRatio;
    }
    // Reduce health based on fault impact
    healthScore -= faultImpactScore * 0.3;
    
    return {
      totalPorts,
      activePorts,
      connectedPorts,
      totalPacketsSent,
      totalPacketsReceived,
      averagePacketsPerSecond,
      healthScore: Math.max(0, Math.round(healthScore)),
      treeCount: agent.trees_count || 0,
      leafwardConnections: agent.total_leafward_connections || 0,
      
      // Fault injection analysis
      faultInjectionPorts,
      totalPacketsDropped,
      totalPacketsDelayed,
      overallDropRate,
      overallDelayRate,
      faultImpactScore: Math.round(faultImpactScore)
    };
  }, [cell, portAnalysis]);

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthBadgeVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  const getFaultImpactColor = (score: number) => {
    if (score >= 50) return 'text-red-600';
    if (score >= 25) return 'text-orange-600';
    if (score >= 10) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Server className="w-4 h-4" />
            <span className="truncate">{cellId}</span>
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            <Badge variant={cell.status === 'alive' ? "default" : "destructive"} className="text-xs">
              {cell.status === 'alive' ? (
                <CheckCircle className="w-3 h-3 mr-1" />
              ) : (
                <AlertTriangle className="w-3 h-3 mr-1" />
              )}
              {cell.status}
            </Badge>
            <Badge variant={getHealthBadgeVariant(cellAnalysis.healthScore)} className="text-xs">
              {cellAnalysis.healthScore}%
            </Badge>
            {cellAnalysis.faultInjectionPorts > 0 && (
              <Badge variant="destructive" className="text-xs">
                <ShieldAlert className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">{cellAnalysis.faultInjectionPorts} faults</span>
                <span className="sm:hidden">{cellAnalysis.faultInjectionPorts}</span>
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Tab Navigation - Ultra Mobile Responsive */}
        <div className="mb-3">
          {/* Mobile: Horizontal scrollable tabs */}
          <div className="sm:hidden">
            <div className="flex gap-1 text-xs overflow-x-auto pb-1 scrollbar-hide">
              <Button
                size="sm"
                variant={activeTab === 'overview' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('overview')}
                className="h-6 px-2 text-xs whitespace-nowrap flex-shrink-0"
              >
                Overview
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'faults' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('faults')}
                className="h-6 px-2 text-xs whitespace-nowrap flex-shrink-0"
              >
                <ShieldAlert className="w-3 h-3 mr-1" />
                Faults
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'analysis' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('analysis')}
                className="h-6 px-2 text-xs whitespace-nowrap flex-shrink-0"
              >
                <BarChart3 className="w-3 h-3 mr-1" />
                Stats
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'ports' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('ports')}
                className="h-6 px-2 text-xs whitespace-nowrap flex-shrink-0"
              >
                <Network className="w-3 h-3 mr-1" />
                Ports
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'agent' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('agent')}
                className="h-6 px-2 text-xs whitespace-nowrap flex-shrink-0"
              >
                <Zap className="w-3 h-3 mr-1" />
                Agent
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'raw' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('raw')}
                className="h-6 px-2 text-xs whitespace-nowrap flex-shrink-0"
              >
                Raw
              </Button>
            </div>
          </div>
          
          {/* Desktop: Single row */}
          <div className="hidden sm:flex gap-1 text-xs">
            <Button
              size="sm"
              variant={activeTab === 'overview' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('overview')}
              className="h-6 px-2 text-xs"
            >
              Overview
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'faults' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('faults')}
              className="h-6 px-2 text-xs"
            >
              <ShieldAlert className="w-3 h-3 mr-1" />
              Faults
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'analysis' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('analysis')}
              className="h-6 px-2 text-xs"
            >
              <BarChart3 className="w-3 h-3 mr-1" />
              Stats
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'ports' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('ports')}
              className="h-6 px-2 text-xs"
            >
              <Network className="w-3 h-3 mr-1" />
              Ports
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'agent' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('agent')}
              className="h-6 px-2 text-xs"
            >
              <Zap className="w-3 h-3 mr-1" />
              Agent
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'raw' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('raw')}
              className="h-6 px-2 text-xs"
            >
              Raw
            </Button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-2">
          {activeTab === 'overview' && (
            <div className="space-y-2">
              {cell.host && (
                <div className="text-xs text-gray-600">
                  Host: {cell.host}
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-blue-50 p-2 rounded">
                  <div className="font-medium text-blue-700">Ports</div>
                  <div className="text-blue-600">
                    {cellAnalysis.connectedPorts}/{cellAnalysis.totalPorts}
                  </div>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <div className="font-medium text-green-700">Activity</div>
                  <div className="text-green-600">
                    {cellAnalysis.activePorts} active
                  </div>
                </div>
              </div>

              {/* Fault injection overview */}
              {cellAnalysis.faultInjectionPorts > 0 && (
                <div className="bg-red-50 border border-red-200 p-2 rounded text-xs">
                  <div className="flex items-center gap-1 font-medium text-red-700 mb-1">
                    <ShieldAlert className="w-3 h-3" />
                    Fault Injection Active
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <div className="text-red-600">Ports</div>
                      <div className="font-bold text-red-700">{cellAnalysis.faultInjectionPorts}</div>
                    </div>
                    <div>
                      <div className="text-red-600">Dropped</div>
                      <div className="font-bold text-red-700">{cellAnalysis.totalPacketsDropped}</div>
                    </div>
                    <div>
                      <div className="text-red-600">Impact</div>
                      <div className={`font-bold ${getFaultImpactColor(cellAnalysis.faultImpactScore)}`}>
                        {cellAnalysis.faultImpactScore}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 p-2 rounded text-xs">
                <div className="font-medium">Quick Stats</div>
                <div className="text-gray-600">
                  {cellAnalysis.totalPacketsSent + cellAnalysis.totalPacketsReceived} total packets
                </div>
                <div className="text-gray-600">
                  {cellAnalysis.averagePacketsPerSecond.toFixed(1)} pps avg
                </div>
                {cellAnalysis.totalPacketsDropped > 0 && (
                  <div className="text-red-600">
                    {cellAnalysis.totalPacketsDropped} packets dropped ({cellAnalysis.overallDropRate.toFixed(1)}%)
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'faults' && (
            <div className="space-y-3">
              {cellAnalysis.faultInjectionPorts === 0 ? (
                <div className="text-center py-6">
                  <Shield className="w-8 h-8 mx-auto text-green-500 mb-2" />
                  <div className="text-sm font-medium text-green-700">No Fault Injection Active</div>
                  <div className="text-xs text-green-600">All ports operating normally</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Overall fault impact */}
                  <div className="bg-gradient-to-r from-red-50 to-red-100 p-3 rounded">
                    <div className="flex items-center gap-2 font-medium text-red-700 mb-2">
                      <ShieldAlert className="w-4 h-4" />
                      Fault Injection Impact
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-red-600">Drop Rate</div>
                        <div className="text-lg font-bold text-red-700">
                          {cellAnalysis.overallDropRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-red-600">
                          {cellAnalysis.totalPacketsDropped} packets dropped
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-red-600">Delay Rate</div>
                        <div className="text-lg font-bold text-orange-700">
                          {cellAnalysis.overallDelayRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-red-600">
                          {cellAnalysis.totalPacketsDelayed} packets delayed
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-red-200">
                      <div className="text-xs text-red-600">Performance Impact Score</div>
                      <div className={`text-xl font-bold ${getFaultImpactColor(cellAnalysis.faultImpactScore)}`}>
                        {cellAnalysis.faultImpactScore}%
                      </div>
                    </div>
                  </div>

                  {/* Per-port fault details */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Port-Level Fault Injection</div>
                    {Object.entries(portAnalysis)
                      .filter(([_, analysis]) => analysis.faultInjectionActive)
                      .map(([portId, analysis]) => (
                      <div key={portId} className="bg-orange-50 border border-orange-200 p-2 rounded text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-medium text-orange-800">{portId}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant="destructive" className="text-xs">
                              <PackageX className="w-3 h-3 mr-1" />
                              {analysis.dropRate.toFixed(1)}%
                            </Badge>
                            {analysis.delayRate > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                <Timer className="w-3 h-3 mr-1" />
                                {analysis.delayRate.toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="text-orange-600 mb-1">Configuration</div>
                            <div className="text-orange-700">Drop: {analysis.configuredDropRate}%</div>
                            <div className="text-orange-700">Delay: {analysis.configuredDelayMs}ms</div>
                          </div>
                          <div>
                            <div className="text-orange-600 mb-1">Actual Impact</div>
                            <div className="text-red-700">{analysis.totalDropped} dropped</div>
                            <div className="text-orange-700">{analysis.totalDelayed} delayed</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-2 rounded text-xs">
                  <div className="flex items-center gap-1 font-medium text-blue-700">
                    <TrendingUp className="w-3 h-3" />
                    Health
                  </div>
                  <div className={`text-sm font-bold ${getHealthColor(cellAnalysis.healthScore)}`}>
                    {cellAnalysis.healthScore}%
                  </div>
                  <div className="text-blue-600">Overall Score</div>
                </div>
                
                <div className="bg-gradient-to-r from-green-50 to-green-100 p-2 rounded text-xs">
                  <div className="flex items-center gap-1 font-medium text-green-700">
                    <Activity className="w-3 h-3" />
                    Throughput
                  </div>
                  <div className="text-sm font-bold text-green-600">
                    {cellAnalysis.averagePacketsPerSecond.toFixed(1)}
                  </div>
                  <div className="text-green-600">Packets/sec</div>
                </div>
              </div>

              {/* Fault impact indicator */}
              {cellAnalysis.faultImpactScore > 0 && (
                <div className="bg-gradient-to-r from-red-50 to-red-100 p-2 rounded text-xs">
                  <div className="flex items-center gap-1 font-medium text-red-700">
                    <Gauge className="w-3 h-3" />
                    Fault Impact
                  </div>
                  <div className={`text-sm font-bold ${getFaultImpactColor(cellAnalysis.faultImpactScore)}`}>
                    {cellAnalysis.faultImpactScore}%
                  </div>
                  <div className="text-red-600">Performance Loss</div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Connection Ratio:</span>
                  <span className="font-medium">
                    {cellAnalysis.totalPorts > 0 
                      ? `${Math.round((cellAnalysis.connectedPorts / cellAnalysis.totalPorts) * 100)}%`
                      : 'N/A'
                    }
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Packets Sent:</span>
                  <span className="font-medium text-blue-600">{cellAnalysis.totalPacketsSent}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Packets Received:</span>
                  <span className="font-medium text-green-600">{cellAnalysis.totalPacketsReceived}</span>
                </div>
                {cellAnalysis.totalPacketsDropped > 0 && (
                  <div className="flex justify-between text-xs">
                    <span>Packets Dropped:</span>
                    <span className="font-medium text-red-600">{cellAnalysis.totalPacketsDropped}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span>Active Ports:</span>
                  <span className="font-medium">{cellAnalysis.activePorts}/{cellAnalysis.totalPorts}</span>
                </div>
                {cellAnalysis.faultInjectionPorts > 0 && (
                  <div className="flex justify-between text-xs">
                    <span>Fault Injection Ports:</span>
                    <span className="font-medium text-orange-600">{cellAnalysis.faultInjectionPorts}</span>
                  </div>
                )}
              </div>

              {(cellAnalysis.healthScore < 70 || cellAnalysis.faultImpactScore > 20) && (
                <div className="bg-yellow-50 border border-yellow-200 p-2 rounded text-xs">
                  <div className="flex items-center gap-1 font-medium text-yellow-700">
                    <AlertCircle className="w-3 h-3" />
                    Performance Issues Detected
                  </div>
                  <div className="text-yellow-600 mt-1">
                    {cell.status !== 'alive' && '• Cell is not responding\n'}
                    {cellAnalysis.connectedPorts === 0 && cellAnalysis.totalPorts > 0 && '• No ports connected\n'}
                    {cellAnalysis.activePorts === 0 && cellAnalysis.connectedPorts > 0 && '• No packet activity detected\n'}
                    {cellAnalysis.faultImpactScore > 20 && '• Significant fault injection impact\n'}
                    {cellAnalysis.overallDropRate > 10 && '• High packet drop rate detected'}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ports' && (
            <div className="space-y-2">
              {Object.keys(portAnalysis).length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-4">
                  No port data available
                </div>
              ) : (
                Object.entries(portAnalysis).map(([portId, analysis]) => (
                  <div key={portId} className={`p-2 rounded text-xs ${
                    analysis.faultInjectionActive ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-medium flex items-center gap-1">
                        {analysis.faultInjectionActive && <ShieldAlert className="w-3 h-3 text-red-500" />}
                        {portId}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge 
                          variant={analysis.healthScore >= 80 ? 'default' : analysis.healthScore >= 60 ? 'secondary' : 'destructive'}
                          className="text-xs"
                        >
                          {analysis.healthScore}%
                        </Badge>
                        {analysis.faultInjectionActive && (
                          <Badge variant="destructive" className="text-xs">
                            <EyeOff className="w-3 h-3 mr-1" />
                            Faults
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                      <div>
                        <div className="text-gray-600">Packets</div>
                        <div className="font-medium">{analysis.totalPackets}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Rate</div>
                        <div className="font-medium">{analysis.packetsPerSecond.toFixed(1)} pps</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Status</div>
                        <div className={`font-medium ${analysis.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                          {analysis.isActive ? 'Active' : 'Idle'}
                        </div>
                      </div>
                    </div>

                    {/* Fault injection details for this port */}
                    {analysis.faultInjectionActive && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-red-200">
                        <div>
                          <div className="text-red-600">Dropped</div>
                          <div className="font-medium text-red-700">
                            {analysis.totalDropped} ({analysis.dropRate.toFixed(1)}%)
                          </div>
                        </div>
                        <div>
                          <div className="text-orange-600">Delayed</div>
                          <div className="font-medium text-orange-700">
                            {analysis.totalDelayed} ({analysis.delayRate.toFixed(1)}%)
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Performance details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t mt-2 text-xs">
                      <div>
                        <div className="text-gray-500">Heartbeats: {analysis.heartbeatsSent}/{analysis.heartbeatsReceived}</div>
                        <div className="text-gray-500">Data: {analysis.dataPacketsSent}/{analysis.dataPacketsReceived}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Uptime: {analysis.uptimeSeconds.toFixed(1)}s</div>
                        <div className="text-gray-500">Last Activity: {analysis.lastActivity}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'agent' && (
            <div className="space-y-2">
              {cell.metrics?.agent ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-purple-50 p-2 rounded text-xs">
                      <div className="font-medium text-purple-700">Trees</div>
                      <div className="text-lg font-bold text-purple-600">
                        {cellAnalysis.treeCount}
                      </div>
                    </div>
                    <div className="bg-indigo-50 p-2 rounded text-xs">
                      <div className="font-medium text-indigo-700">Connections</div>
                      <div className="text-lg font-bold text-indigo-600">
                        {cellAnalysis.leafwardConnections}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-2 rounded text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className="font-medium">{cell.metrics.agent.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Node ID:</span>
                      <span className="font-mono text-xs">{cell.metrics.agent.node_id}</span>
                    </div>
                  </div>

                  {cell.metrics.agent.port_paths && (
                    <div className="bg-blue-50 p-2 rounded text-xs">
                      <div className="font-medium text-blue-700 mb-1">Port Paths</div>
                      <div className="text-blue-600">
                        {Object.keys(cell.metrics.agent.port_paths).length} path(s) configured
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 text-center py-4">
                  No agent data available
                </div>
              )}
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="space-y-2">
              <div className="bg-gray-50 p-2 rounded text-xs max-h-64 overflow-y-auto">
                <div className="font-medium mb-2 text-gray-700">Raw Metrics Data</div>
                      <button
                  onClick={() =>
                    navigator.clipboard.writeText(JSON.stringify(cell.metrics, null, 2))
                  }
                  className="text-gray-500 hover:text-gray-700 text-xs underline"
                >
                  Copy
                </button>

                {cell.metrics ? (
                  <div className="font-mono text-xs">
                    <pre className="whitespace-pre-wrap break-words text-gray-800">
                      {JSON.stringify(cell.metrics, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-gray-500 italic">No metrics data available</div>
                )}
              </div>
              
              <div className="bg-blue-50 p-2 rounded text-xs">
                <div className="font-medium mb-2 text-blue-700">Cell Object</div>
                <div className="font-mono text-xs max-h-32 overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-words text-blue-800">
                    {JSON.stringify({
                      id: cellId,
                      status: cell.status,
                      host: cell.host,
                      hasMetrics: !!cell.metrics,
                      faultInjectionActive: cellAnalysis.faultInjectionPorts > 0
                    }, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Action Buttons - Mobile Responsive */}
        <div className="flex flex-col sm:flex-row gap-1 pt-3 mt-3 border-t">
          <Button 
            onClick={() => getMetrics(cellId)}
            size="sm" 
            variant="outline" 
            className="text-xs flex-1"
          >
            <Activity className="w-3 h-3 mr-1" />
            Refresh
          </Button>
          <Button 
            onClick={() => removeCell(cellId)}
            size="sm" 
            variant="destructive" 
            className="text-xs sm:w-auto"
          >
            <Trash2 className="w-3 h-3 mr-1 sm:mr-0" />
            <span className="sm:hidden">Remove Cell</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}