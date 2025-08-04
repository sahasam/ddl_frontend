import React, { useState, useEffect, useRef } from 'react';
import { useMacMiniContext } from '@/context/MacMiniContext';
import { MacMini } from '@/types/MacMini';
import { MessageData } from '@/types/PortSnapshot';
import PortStatus from '@/components/views/tree/PortStatus';
import TreeNode from '@/components/views/tree/TreeNode';
import { HoveredPortInfo } from '@/types/HoveredPort';



const TreeView: React.FC = () => {
  const { selectedMacMinis } = useMacMiniContext();
  const [messages, setMessages] = useState<Record<string, any>>({});
  const messageHandlers = useRef<Map<string, (event: MessageEvent) => void>>(new Map());
  const connectionRefs = useRef<Map<string, WebSocket>>(new Map());
  const [hoveredPortInfo, setHoveredPortInfo] = useState<HoveredPortInfo | null>(null);

  useEffect(() => {
    // Clean up previous connections not in selection anymore
    const selectedIps = new Set(selectedMacMinis.map(m => m.ip));
    
    [...connectionRefs.current.keys()].forEach(ip => {
      if (!selectedIps.has(ip)) {
        const conn = connectionRefs.current.get(ip);
        const handler = messageHandlers.current.get(ip);
        
        if (conn && handler) {
          conn.removeEventListener('message', handler);
        }
        
        connectionRefs.current.delete(ip);
        messageHandlers.current.delete(ip);
        
        setMessages(prev => {
          const newMessages = {...prev};
          delete newMessages[ip];
          return newMessages;
        });
      }
    });
    
    // Set up handlers for new connections
    selectedMacMinis.forEach(macMini => {
      const ip = macMini.ip;
      const conn = macMini.connection;
      
      // Track if this is a new or changed connection
      const currentConn = connectionRefs.current.get(ip);
      const isNewOrChangedConnection = conn && conn !== currentConn;
      
      if (isNewOrChangedConnection) {
        // Remove old handler if it exists
        if (currentConn && messageHandlers.current.has(ip)) {
          const oldHandler = messageHandlers.current.get(ip);
          if (oldHandler) {
            currentConn.removeEventListener('message', oldHandler);
          }
        }
        
        // Create and attach new handler
        const handler = (event: MessageEvent) => {
          try {
            const message = JSON.parse(event.data);
            setMessages(prev => ({
              ...prev,
              [ip]: message
            }));
          } catch (e) {
            console.error(`Failed to parse message from ${ip}:`, e);
          }
        };
        
        conn.addEventListener('message', handler);
        messageHandlers.current.set(ip, handler);
        connectionRefs.current.set(ip, conn);
      }
    });

    return () => {
      // Cleanup all handlers
      messageHandlers.current.forEach((handler, ip) => {
        const conn = connectionRefs.current.get(ip);
        if (conn) {
          conn.removeEventListener('message', handler);
        }
      });
      messageHandlers.current.clear();
      connectionRefs.current.clear();
    };
  }, [selectedMacMinis]);

  const renderMacMiniDetails = (macMini: MacMini) => {
    const message = messages[macMini.ip] as MessageData | undefined;
    if (!message) return null;
    
    return (
      <div key={macMini.ip} className="mb-4 flex flex-col w-[400px] border rounded p-4 shadow-sm">
        <div className="text-sm font-bold mb-2 border-b pb-1">{message.node_id} ({macMini.ip})</div>
        
        {/* Port Status Section */}
        {message.snapshots && Object.keys(message.snapshots).length > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase font-semibold text-gray-500 mb-1">Network Interfaces</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(message.snapshots).map(([port, snapshot]) => (
                <div 
                  key={port} 
                  className="flex-1 min-w-[300px] max-w-full"
                  onMouseEnter={() => setHoveredPortInfo({
                    macMiniIp: macMini.ip,
                    portId: snapshot.name,
                    neighborPortId: snapshot.connection?.neighbor_portid || null
                  })}
                  onMouseLeave={() => setHoveredPortInfo(null)}
                >
                  <PortStatus port={port} snapshot={snapshot} hoveredPortInfo={hoveredPortInfo} />
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Trees Section */}
        {message.trees_dict && Object.keys(message.trees_dict).length > 0 && (
          <div>
            <div className="text-xs uppercase font-semibold text-gray-500 mb-1">Tree Connections</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(message.trees_dict).map(([nodeId, treeData]) => (
                <div key={nodeId} className="flex-1 min-w-[300px] max-w-full border rounded p-2">
                  <TreeNode nodeId={nodeId} treeData={treeData} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-2 overflow-y-auto max-h-[calc(100vh-8rem)]">
      <h2 className="text-sm font-bold mb-2">Tree View</h2>
      <div className="flex flex-wrap gap-4">
        {selectedMacMinis.map((macMini) => (renderMacMiniDetails(macMini)))}
      </div>
    </div>
  );
};

export default TreeView;
