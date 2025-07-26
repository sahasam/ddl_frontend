import React, { useRef, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Server, Activity, CheckCircle, AlertTriangle, Network, Upload } from 'lucide-react';
import { useDatacenterContext } from '@/context/DatacenterContext';
import { FloatingPanel } from './FloatingPanel';
import { CellStatus } from './CellStatus';
import { DAGVisualization } from './DAGVisualization';
import { TopologyUpload } from './TopologyUpload';

export function DatacenterDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { cells, isConnected, lastUpdate } = useDatacenterContext();
  const [activeTab, setActiveTab] = useState<'cells' | 'dag' | 'upload'>('cells');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
              <Server className="w-8 h-8" />
              Datacenter Emulator
            </h1>
            <p className="text-slate-600 mt-1">
              Real-time datacenter simulation and control
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={isConnected ? "default" : "destructive"} className="px-3 py-1">
              {isConnected ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Connected
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Disconnected
                </>
              )}
            </Badge>
            {lastUpdate && (
              <div className="text-xs text-slate-500">
                Last update: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="flex space-x-2">
          <Button
            variant={activeTab === 'cells' ? 'default' : 'outline'}
            onClick={() => setActiveTab('cells')}
            className="flex items-center gap-2"
          >
            <Activity className="w-4 h-4" />
            Cells ({Object.keys(cells).length})
          </Button>
          <Button
            variant={activeTab === 'dag' ? 'default' : 'outline'}
            onClick={() => setActiveTab('dag')}
            className="flex items-center gap-2"
          >
            <Network className="w-4 h-4" />
            Topology
          </Button>
          <Button
            variant={activeTab === 'upload' ? 'default' : 'outline'}
            onClick={() => setActiveTab('upload')}
            className="flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full h-[calc(100vh-12rem)] border rounded-lg bg-white shadow-sm overflow-hidden"
      >
        <FloatingPanel containerRef={containerRef} />
        
        <div className="p-6 h-full overflow-y-auto">
          {activeTab === 'cells' && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Active Cells ({Object.keys(cells).length})
                </h2>
              </div>
              
              {Object.keys(cells).length === 0 ? (
                <div className="flex items-center justify-center h-64 text-slate-500">
                  <div className="text-center">
                    <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No cells active</p>
                    <p className="text-sm">Use the control panel to add cells to your datacenter</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Object.entries(cells).map(([cellId, cell]) => (
                    <CellStatus key={cellId} cellId={cellId} cell={cell} />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'dag' && (
            <DAGVisualization />
          )}

          {activeTab === 'upload' && (
            <div className="max-w-2xl mx-auto">
              <TopologyUpload onUploadSuccess={() => {
                // Refresh cells after upload
                setTimeout(() => {
                  setActiveTab('cells');
                }, 1000);
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}