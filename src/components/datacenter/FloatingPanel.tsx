import React, { useRef, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Trash2, 
  Link2, 
  RefreshCw, 
  Server, 
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  CheckCircle,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useDatacenterContext } from '@/context/DatacenterContext';
import { LinkFormData } from '@/types/datacenter';

interface FloatingPanelProps {
  containerRef: React.RefObject<HTMLDivElement | null>; // Allow null
}

interface FaultForm {
  cellId: string;
  portName: string;
  faultType: 'drop' | 'delay' | 'disconnect';
  dropRate: string;
  delayTime: string;
}

export function FloatingPanel({ containerRef }: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [minimized, setMinimized] = useState(false);
  const [visible, setVisible] = useState(true);
  
  const { 
    isConnected, 
    addCell, 
    removeCell, 
    createLink, 
    getStatus, 
    teardown, 
    injectFault,
    clearFault,
    cells,
    bindCell,
    unbindCell
  } = useDatacenterContext();

  const [cellId, setCellId] = useState('');
  const [rpcPort, setRpcPort] = useState('9001');
  const [host, setHost] = useState('localhost');

  const [linkForm, setLinkForm] = useState<LinkFormData>({
    cell1: '',
    port1: '',
    cell2: '',
    port2: '',
    addr1: '',
    addr2: ''
  });

  const [faultForm, setFaultForm] = useState<FaultForm>({
    cellId: '',
    portName: '',
    faultType: 'drop',
    dropRate: '50',
    delayTime: '100'
  });
  const [bindForm, setBindForm] = useState({
    cellId: '',
    portName: '',
    address: ''
  });
  
  {/* Add these handler functions with the other handlers */}
  const handleBind = () => {
    const { cellId, portName, address } = bindForm;
    if (cellId && portName && address) {
      bindCell(cellId, portName, address);
      setBindForm({
        cellId: '',
        portName: '',
        address: ''
      });
    }
  };
  
  const handleUnbind = () => {
    const { cellId, portName } = bindForm;
    if (cellId && portName) {
      unbindCell(cellId, portName);
      setBindForm({
        cellId: '',
        portName: '',
        address: ''
      });
    }
  };
  

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!panelRef.current || !containerRef.current) return;

    const panelRect = panelRef.current.getBoundingClientRect();
    const offsetX = e.clientX - panelRect.left;
    const offsetY = e.clientY - panelRect.top;

    offsetRef.current = { x: offsetX, y: offsetY };
    draggingRef.current = true;
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current || !panelRef.current || !containerRef.current) return;
  
    const container = containerRef.current;
    const panel = panelRef.current;
    const offset = offsetRef.current;
  
    let newX = e.clientX - container.getBoundingClientRect().left - offset.x;
    let newY = e.clientY - container.getBoundingClientRect().top - offset.y;
  
    newX = Math.max(0, Math.min(newX, container.offsetWidth - panel.offsetWidth));
    newY = Math.max(0, Math.min(newY, container.offsetHeight - panel.offsetHeight));
  
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
  };

  useEffect(() => {
    if (containerRef.current && panelRef.current) {
      const updatePosition = () => {
        const container = containerRef.current;
        const panel = panelRef.current;
        if (!container || !panel) return;

        const containerWidth = container.offsetWidth;
        const panelWidth = panel.offsetWidth;
        const containerHeight = container.offsetHeight;
        const panelHeight = panel.offsetHeight;

        let newX = containerWidth - panelWidth - 16;
        let newY = 16;

        newX = Math.max(0, Math.min(newX, containerWidth - panelWidth));
        newY = Math.max(0, Math.min(newY, containerHeight - panelHeight));

        setPosition({ x: newX, y: newY });
      };

      updatePosition();

      window.addEventListener("resize", updatePosition);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [containerRef]);

  const handleAddCell = () => {
    if (cellId && rpcPort) {
      addCell(cellId, parseInt(rpcPort), host);
      setCellId('');
      setRpcPort(String(parseInt(rpcPort) + 1));
    }
  };

  const handleCreateLink = () => {
    const { cell1, port1, cell2, port2, addr1, addr2 } = linkForm;
    if (cell1 && port1 && cell2 && port2 && addr1 && addr2) {
      createLink(cell1, port1, cell2, port2, addr1, addr2);
      setLinkForm({
        cell1: '',
        port1: '',
        cell2: '',
        port2: '',
        addr1: '',
        addr2: ''
      });
    }
  };

  const handleInjectFault = () => {
    const { cellId, portName, faultType, dropRate, delayTime } = faultForm;
    
    if (!cellId) {
      alert('Cell ID is required');
      return;
    }

    let params = {};
    
    switch (faultType) {
      case 'drop':
        if (!portName) {
          alert('Port name is required for drop fault');
          return;
        }
        const dropRateNum = parseFloat(dropRate);
        if (isNaN(dropRateNum) || dropRateNum < 0 || dropRateNum > 100) {
          alert('Drop rate must be a number between 0 and 100');
          return;
        }
        params = { drop_rate: dropRateNum / 100 }; // Convert percentage to decimal
        break;
        
      case 'delay':
        if (!portName) {
          alert('Port name is required for delay fault');
          return;
        }
        const delayMs = parseInt(delayTime);
        if (isNaN(delayMs) || delayMs < 0) {
          alert('Delay time must be a positive number in milliseconds');
          return;
        }
        params = { delay: delayMs };
        break;
        
      case 'disconnect':
        // For disconnect, port might be optional but can be specified
        params = {};
        break;
    }

    injectFault(cellId, portName, faultType, params);
  };

  const handleClearFault = () => {
    const { cellId, portName } = faultForm;
    
    if (!cellId) {
      alert('Cell ID is required');
      return;
    }

    clearFault(cellId, portName);
  };

  // Get available cells for dropdown
  const availableCells = Object.keys(cells);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className="absolute z-50 bg-white shadow-lg border rounded-md w-80 max-h-[80vh] overflow-hidden"
      style={{ top: position.y, left: position.x }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b bg-gray-100 rounded-t-md cursor-move"
        onMouseDown={handleMouseDown}
      >
        <span className="text-sm font-medium flex items-center gap-2">
          <Server className="w-4 h-4" />
          Datacenter Control
          <Badge variant={isConnected ? "default" : "destructive"} className="text-xs">
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </span>
        <div className="flex space-x-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMinimized((prev) => !prev)}
          >
            {minimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setVisible(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {!minimized && (
        <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Quick Actions */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={getStatus} variant="outline" size="sm" className="text-xs">
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
              <Button onClick={teardown} variant="destructive" size="sm" className="text-xs">
                <Trash2 className="w-3 h-3 mr-1" />
                Teardown
              </Button>
            </div>
          </div>

          {/* Add Cell */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Add Cell</h3>
            <div className="space-y-2">
              <Input
                placeholder="Cell ID"
                value={cellId}
                onChange={(e) => setCellId(e.target.value)}
                className="text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="RPC Port"
                  value={rpcPort}
                  onChange={(e) => setRpcPort(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="text-xs"
                />
              </div>
              <Button onClick={handleAddCell} className="w-full text-xs" size="sm">
                <Plus className="w-3 h-3 mr-1" />
                Add Cell
              </Button>
            </div>
          </div>

          {/* Create Link */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Create Link</h3>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Cell 1"
                  value={linkForm.cell1}
                  onChange={(e) => setLinkForm({...linkForm, cell1: e.target.value})}
                  className="text-xs"
                />
                <Input
                  placeholder="Port 1"
                  value={linkForm.port1}
                  onChange={(e) => setLinkForm({...linkForm, port1: e.target.value})}
                  className="text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Cell 2"
                  value={linkForm.cell2}
                  onChange={(e) => setLinkForm({...linkForm, cell2: e.target.value})}
                  className="text-xs"
                />
                <Input
                  placeholder="Port 2"
                  value={linkForm.port2}
                  onChange={(e) => setLinkForm({...linkForm, port2: e.target.value})}
                  className="text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Address 1"
                  value={linkForm.addr1}
                  onChange={(e) => setLinkForm({...linkForm, addr1: e.target.value})}
                  className="text-xs"
                />
                <Input
                  placeholder="Address 2"
                  value={linkForm.addr2}
                  onChange={(e) => setLinkForm({...linkForm, addr2: e.target.value})}
                  className="text-xs"
                />
              </div>
              <Button onClick={handleCreateLink} className="w-full text-xs" size="sm" variant="outline">
                <Link2 className="w-3 h-3 mr-1" />
                Create Link
              </Button>
            </div>
          </div>
          <div className="space-y-2">
          <h3 className="text-sm font-semibold">Port Binding</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">Cell ID</label>
                {availableCells.length > 0 ? (
                  <select
                    value={bindForm.cellId}
                    onChange={(e) => setBindForm({...bindForm, cellId: e.target.value})}
                    className="w-full text-xs border rounded px-2 py-1"
                  >
                    <option value="">Select Cell</option>
                    {availableCells.map(cell => (
                      <option key={cell} value={cell}>{cell}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    placeholder="Cell ID"
                    value={bindForm.cellId}
                    onChange={(e) => setBindForm({...bindForm, cellId: e.target.value})}
                    className="text-xs"
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-gray-600">Port Name</label>
                <Input
                  placeholder="Port (e.g., p0, en0)"
                  value={bindForm.portName}
                  onChange={(e) => setBindForm({...bindForm, portName: e.target.value})}
                  className="text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600">Address</label>
              <Input
                placeholder="IP Address (e.g., 192.168.1.10)"
                value={bindForm.address}
                onChange={(e) => setBindForm({...bindForm, address: e.target.value})}
                className="text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                onClick={handleBind}
                variant="default" 
                size="sm" 
                className="text-xs"
                disabled={!bindForm.cellId || !bindForm.portName || !bindForm.address}
              >
                <Wifi className="w-3 h-3 mr-1" />
                Bind Port
              </Button>
              <Button 
                onClick={handleUnbind}
                variant="outline" 
                size="sm" 
                className="text-xs"
                disabled={!bindForm.cellId || !bindForm.portName}
              >
                <WifiOff className="w-3 h-3 mr-1" />
                Unbind Port
              </Button>
            </div>
          </div>
        </div>

          {/* Enhanced Fault Injection */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Fault Injection</h3>
            <div className="space-y-2">
              {/* Cell Selection */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600">Cell ID</label>
                  {availableCells.length > 0 ? (
                    <Select
                      value={faultForm.cellId}
                      onValueChange={(value) => setFaultForm({...faultForm, cellId: value})}
                    >
                      <SelectTrigger className="w-full text-xs">
                        <SelectValue placeholder="Select Cell" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCells.map(cell => (
                          <SelectItem key={cell} value={cell}>{cell}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="Cell ID"
                      value={faultForm.cellId}
                      onChange={(e) => setFaultForm({...faultForm, cellId: e.target.value})}
                      className="text-xs"
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-600">Port Name</label>
                  <Input
                    placeholder="Port (e.g., p0, en0)"
                    value={faultForm.portName}
                    onChange={(e) => setFaultForm({...faultForm, portName: e.target.value})}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Fault Type Selection */}
              <div>
                <label className="text-xs text-gray-600">Fault Type</label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  <Button
                    size="sm"
                    variant={faultForm.faultType === 'drop' ? 'default' : 'outline'}
                    onClick={() => setFaultForm({...faultForm, faultType: 'drop'})}
                    className="text-xs"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    Drop
                  </Button>
                  <Button
                    size="sm"
                    variant={faultForm.faultType === 'delay' ? 'default' : 'outline'}
                    onClick={() => setFaultForm({...faultForm, faultType: 'delay'})}
                    className="text-xs"
                  >
                    <Clock className="w-3 h-3 mr-1" />
                    Delay
                  </Button>
                  <Button
                    size="sm"
                    variant={faultForm.faultType === 'disconnect' ? 'default' : 'outline'}
                    onClick={() => setFaultForm({...faultForm, faultType: 'disconnect'})}
                    className="text-xs"
                  >
                    <WifiOff className="w-3 h-3 mr-1" />
                    Disconnect
                  </Button>
                </div>
              </div>

              {/* Fault Parameters */}
              {faultForm.faultType === 'drop' && (
                <div>
                  <label className="text-xs text-gray-600">Drop Rate (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="50"
                    value={faultForm.dropRate}
                    onChange={(e) => setFaultForm({...faultForm, dropRate: e.target.value})}
                    className="text-xs"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Percentage of packets to drop (0-100)
                  </div>
                </div>
              )}

              {faultForm.faultType === 'delay' && (
                <div>
                  <label className="text-xs text-gray-600">Delay (ms)</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="100"
                    value={faultForm.delayTime}
                    onChange={(e) => setFaultForm({...faultForm, delayTime: e.target.value})}
                    className="text-xs"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Delay in milliseconds
                  </div>
                </div>
              )}

              {faultForm.faultType === 'disconnect' && (
                <div className="bg-red-50 border border-red-200 p-2 rounded text-xs">
                  <div className="text-red-700 font-medium">Disconnect Fault</div>
                  <div className="text-red-600">
                    This will disconnect the specified port or entire cell.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  onClick={handleInjectFault}
                  variant="destructive" 
                  size="sm" 
                  className="text-xs"
                  disabled={!faultForm.cellId}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  Inject Fault
                </Button>
                <Button 
                  onClick={handleClearFault}
                  variant="outline" 
                  size="sm" 
                  className="text-xs"
                  disabled={!faultForm.cellId}
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Clear Fault
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}