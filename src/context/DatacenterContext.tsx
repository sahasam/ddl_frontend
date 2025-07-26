"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DatacenterWebSocket } from '@/services/DatacenterWebSocket';
import { Cell, DatacenterState, WebSocketMessage } from '@/types/datacenter';

const DatacenterContext = createContext<DatacenterState>({} as DatacenterState);

export function DatacenterProvider({ children }: { children: ReactNode }) {
  const [datacenterWS] = useState(() => new DatacenterWebSocket());
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [links, setLinks] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    datacenterWS.connect()
      .then(() => setIsConnected(true))
      .catch(console.error);

    const removeHandler = datacenterWS.addMessageHandler((message: WebSocketMessage) => {
      setLastUpdate(new Date());
      
      switch (message.type) {
        case 'command_response':
          handleCommandResponse(message);
          break;
        case 'metrics_update':
          handleMetricsUpdate(message.data);
          break;
        case 'error':
          console.error('Server error:', message.message);
          break;
      }
    });

    // Get initial status
    setTimeout(() => {
      if (datacenterWS.isConnected()) {
        datacenterWS.sendCommand('get_status');
      }
    }, 1000);

    return () => {
      removeHandler();
      datacenterWS.disconnect();
    };
  }, [datacenterWS]);

  const handleCommandResponse = (message: any) => {
    if (message.command === 'get_status' && message.result.success) {
      const statusData = message.result.data;
      setCells(prevCells => {
        const newCells = { ...prevCells };
        Object.entries(statusData).forEach(([cellId, status]) => {
          newCells[cellId] = {
            ...newCells[cellId],
            id: cellId,
            status: status as 'alive' | 'unreachable'
          };
        });
        return newCells;
      });
    }
  };

  const handleMetricsUpdate = (metricsData: Record<string, any>) => {
    setCells(prevCells => {
      const newCells = { ...prevCells };
      Object.entries(metricsData).forEach(([cellId, metrics]) => {
        if (metrics.error) {
          newCells[cellId] = {
            id: cellId,
            status: 'unreachable',
            metrics: null
          };
        } else {
          newCells[cellId] = {
            id: cellId,
            status: 'alive',
            metrics
          };
        }
      });
      return newCells;
    });
  };

  const addCell = (cellId: string, rpcPort: number, host: string = 'localhost') => {
    datacenterWS.sendCommand('add_cell', { cell_id: cellId, rpc_port: rpcPort, host });
  };

  const removeCell = (cellId: string) => {
    datacenterWS.sendCommand('remove_cell', { cell_id: cellId });
    setCells(prev => {
      const newCells = { ...prev };
      delete newCells[cellId];
      return newCells;
    });
  };

  const createLink = (cell1: string, port1: string, cell2: string, port2: string, addr1: string, addr2: string) => {
    datacenterWS.sendCommand('create_link', {
      cell1, port1, cell2, port2, addr1, addr2
    });
  };

  const getStatus = () => {
    datacenterWS.sendCommand('get_status');
  };

  const getMetrics = (cellId: string) => {
    datacenterWS.sendCommand('get_metrics', { cell_id: cellId });
  };

  const teardown = () => {
    datacenterWS.sendCommand('teardown');
    setCells({});
    setLinks([]);
  };

  const injectFault = (cellId: string, portName: string, faultType: string, params: any = {}) => {
    datacenterWS.sendCommand('inject_fault', {
      cell_id: cellId,
      port_name: portName,
      fault_type: faultType,
      fault_params: params
    });
  };

  const clearFault = (cellId: string, portName: string) => {
    datacenterWS.sendCommand('clear_fault', {
      cell_id: cellId,
      port_name: portName
    });
  };

  // Add sendCommand method to context
  const sendCommand = (command: string, params: any = {}) => {
    datacenterWS.sendCommand(command, params);
  };

  const contextValue: DatacenterState = {
    cells,
    links,
    isConnected,
    lastUpdate,
    addCell,
    removeCell,
    createLink,
    getStatus,
    getMetrics,
    teardown,
    injectFault,
    clearFault,
    sendCommand,
  };

  return (
    <DatacenterContext.Provider value={contextValue}>
      {children}
    </DatacenterContext.Provider>
  );
}

export function useDatacenterContext() {
  return useContext(DatacenterContext);
}