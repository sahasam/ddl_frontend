"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { DatacenterWebSocket } from '@/services/DatacenterWebSocket';
import { Cell, DatacenterState, WebSocketMessage } from '@/types/datacenter';

const DatacenterContext = createContext<DatacenterState>({} as DatacenterState);

export function DatacenterProvider({ children }: { children: ReactNode }) {
  const [datacenterWS] = useState(() => new DatacenterWebSocket());
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [links, setLinks] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [fspStatus, setFspStatus] = useState<Record<string, any>>({});
  
  // Track pending requests to match responses
  const pendingRequests = useRef<Map<string, any>>(new Map());

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
    
    // Handle message responses with tracked requests
    else if (message.command === 'get_messages' && message.result.success) {
      const messages = message.result.messages || [];
      
      // Get the most recent get_messages request params
      const pendingRequest = pendingRequests.current.get('get_messages');
      const cellId = pendingRequest?.cell_id;
      
      console.log('Got messages response:', { cellId, messages, pendingRequest }); // Debug log
      
      if (cellId) {
        // Dispatch custom event for messaging tab to listen to
        window.dispatchEvent(new CustomEvent('cellMessagesUpdated', {
          detail: { 
            cellId: cellId, 
            messages: messages 
          }
        }));
        
        // Clear the pending request
        pendingRequests.current.delete('get_messages');
      }
    }
    
    else if (message.command === 'send_message') {
      if (message.result.success) {
        console.log('Message sent successfully:', message.result.message);
      } else {
        console.error('Failed to send message:', message.result.message);
      }
    }
    
    else if (message.command === 'broadcast_message') {
      if (message.result.success) {
        console.log('Broadcast sent successfully:', message.result.message);
      } else {
        console.error('Failed to broadcast message:', message.result.message);
      }
    }
    
    else if (message.command === 'clear_messages') {
      if (message.result.success) {
        console.log('Messages cleared successfully');
        
        // Get the pending request params
        const pendingRequest = pendingRequests.current.get('clear_messages');
        const cellId = pendingRequest?.cell_id;
        
        if (cellId) {
          // Dispatch event to update UI
          window.dispatchEvent(new CustomEvent('cellMessagesCleared', {
            detail: { cellId: cellId }
          }));
          
          // Clear the pending request
          pendingRequests.current.delete('clear_messages');
        }
      }
    }
    
    else if (message.command === 'all_fsp_status' && message.result.success) {
      setFspStatus(message.result.data || {});
    }
    
    else if (message.command === 'manual_fsp') {
      if (message.result.success) {
        console.log('Manual FSP triggered successfully');
      } else {
        console.error('Failed to trigger manual FSP:', message.result.message);
      }
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

  const bindCell = (cellId: string, portname: string, addr: string) => {
    datacenterWS.sendCommand('bind', { cell_id: cellId, port_name: portname, addr: addr});
  }

  const unbindCell = (cellId: string, portname: string) => {
    datacenterWS.sendCommand('unbind', {cell_id: cellId, port_name: portname})
  }

  const sendMessage = (fromCellId: string, toCellId: string, message: any) => {
    datacenterWS.sendCommand('send_message', {
      from_cell: fromCellId,
      to_cell: toCellId,
      message: message
    });
  }

  const getMessages = (cellId: string, fromCell: string | null = null) => {
    const params = { cell_id: cellId, from_cell: fromCell };
    
    // Store the request params so we can match it with the response
    pendingRequests.current.set('get_messages', params);
    
    datacenterWS.sendCommand('get_messages', params);
  }
  
  const broadcastMessage = (cellId: string, message: any) => {
    datacenterWS.sendCommand('broadcast_message', {
      cell_id: cellId,
      message: message
    });
  }

  const clearMessage = (cellId: string) => {
    const params = { cell_id: cellId };
    
    // Store the request params so we can match it with the response
    pendingRequests.current.set('clear_messages', params);
    
    datacenterWS.sendCommand('clear_messages', params);
  }

  const manualFsp = (general: string) => {
    datacenterWS.sendCommand('manual_fsp', { general });
  };

  const getAllFspStatus = () => {
    datacenterWS.sendCommand('all_fsp_status');
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
    fspStatus,
    addCell,
    removeCell,
    createLink,
    getStatus,
    getMetrics,
    teardown,
    injectFault,
    clearFault,
    sendCommand,
    unbindCell,
    bindCell,
    sendMessage,
    getMessages,
    broadcastMessage,
    clearMessage,
    manualFsp,
    getAllFspStatus
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