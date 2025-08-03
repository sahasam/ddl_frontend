// types/datacenter.ts
export interface Cell {
    id: string;
    status: 'alive' | 'unreachable';
    metrics?: any;
    host?: string;
  }
  
  export interface Link {
    cell1: string;
    port1: string;
    cell2: string;
    port2: string;
    addr1: string;
    addr2: string;
  }
  
  export interface DatacenterState {
    cells: Record<string, Cell>;
    links: Link[];
    isConnected: boolean;
    lastUpdate: Date | null;
    addCell: (cellId: string, rpcPort: number, host?: string) => void;
    removeCell: (cellId: string) => void;
    createLink: (cell1: string, port1: string, cell2: string, port2: string, addr1: string, addr2: string) => void;
    getStatus: () => void;
    getMetrics: (cellId: string) => void;
    teardown: () => void;
    injectFault: (cellId: string, portName: string, faultType: string, params?: any) => void;
    unbindCell: (cellId: string, portname: string) => void;
    bindCell: (cellId: string, portname: string, addr: string) => void;
    getMessages: (cellId: string, fromCell: string | null) => void;
    sendMessage: (fromCellId: string, toCellId: string, message: any) => void;
    broadcastMessage: (cellId: string, message: any) => void;
    clearMessage: (cellId: string) => void;
    clearFault: (cellId: string, portName: string) => void;
    sendCommand: (command: string, params?: any) => void;
    fspStatus: Record<string, any>;
    manualFsp: (general: string) => void;
    getAllFspStatus: () => void;
  }
  
  export interface WebSocketMessage {
    type: 'command_response' | 'metrics_update' | 'error';
    command?: string;
    result?: any;
    data?: any;
    message?: string;
  }
  
  export interface LinkFormData {
    cell1: string;
    port1: string;
    cell2: string;
    port2: string;
    addr1: string;
    addr2: string;
  }