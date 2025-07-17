"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { MacMini } from "@/types/MacMini";

export type ViewType = "tree" | "raw" | "dag" | "analysis";

interface MacMiniContextState {
  macMinis: MacMini[];
  selectedMacMiniIps: string[];
  selectedMacMinis: MacMini[];
  activeView: ViewType;
  isClient: boolean;
  setMacMinis: (macMinis: MacMini[]) => void;
  selectMacMini: (ip: string) => void;
  deselectMacMini: (ip: string) => void;
  setActiveView: (view: ViewType) => void;
  addMacMini: (ip: string) => void;
  removeMacMini: (ip: string) => void;
  refreshConnection: (ip: string) => Promise<void>;
  checkAllConnections: () => Promise<void>;
}

const MacMiniContext = createContext<MacMiniContextState>({} as MacMiniContextState);

interface MacMiniProviderProps {
  children: ReactNode;
}

const checkWebSocketConnection = (ip: string): Promise<WebSocket | null> => {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${ip}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(null);
    }, 2000);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve(ws);
    };

    const onFail = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    ws.onerror = onFail;
    ws.onclose = onFail;
  });
};

export function MacMiniProvider({ children }: MacMiniProviderProps) {
  const [macMinis, setMacMinis] = useState<MacMini[]>([]);
  const [selectedMacMiniIps, setSelectedMacMiniIps] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<ViewType>("tree");
  const [isClient, setIsClient] = useState(false);

  // Derived property for selected MacMinis based on IPs
  const selectedMacMinis = useMemo(() => {
    return selectedMacMiniIps
      .map(ip => macMinis.find(m => m.ip === ip && m.isConnected))
      .filter(Boolean) as MacMini[];
  }, [macMinis, selectedMacMiniIps]);

  // Client initialization
  useEffect(() => {
    setIsClient(true);
    const stored = localStorage.getItem("macMinis");
    const storedSelection = localStorage.getItem("selectedMacMiniIps");
    
    if (stored) {
      const parsed = JSON.parse(stored);
      // Re-establish connections for previously connected MacMinis
      Promise.all(
        parsed.map(async (mini: MacMini) => {
          if (mini.isConnected) {
            const connection = await checkWebSocketConnection(mini.ip);
            return {
              ...mini,
              isConnected: !!connection,
              connection: connection || undefined,
            };
          }
          return mini;
        })
      ).then(updatedMacMinis => {
        setMacMinis(updatedMacMinis);
        
        // Restore selected IPs, ensuring they still exist and are connected
        if (storedSelection) {
          try {
            const selectedIps = JSON.parse(storedSelection);
            const validIps = selectedIps.filter((ip: string) => 
              updatedMacMinis.some(m => m.ip === ip && m.isConnected)
            );
            setSelectedMacMiniIps(validIps);
          } catch {
            // Invalid stored selection, ignore
          }
        }
      });
    }
  }, []);

  // Persist macMinis and selection to localStorage
  useEffect(() => {
    if (isClient) {
      const serializable = macMinis.map(({ connection, ...rest }) => rest);
      localStorage.setItem("macMinis", JSON.stringify(serializable));
      localStorage.setItem("selectedMacMiniIps", JSON.stringify(selectedMacMiniIps));
    }
  }, [macMinis, selectedMacMiniIps, isClient]);

  // Clean up WebSocket connections on unmount
  useEffect(() => {
    return () => {
      macMinis.forEach(({ connection }) => connection?.close());
    };
  }, [macMinis]);

  const addMacMini = (ip: string) => {
    if (!ip || macMinis.some(m => m.ip === ip)) return;
    setMacMinis([...macMinis, { ip, name: ip, isConnected: false }]);
  };

  const removeMacMini = (ip: string) => {
    const toRemove = macMinis.find(m => m.ip === ip);
    toRemove?.connection?.close();

    setMacMinis(macMinis.filter(m => m.ip !== ip));
    setSelectedMacMiniIps(prev => prev.filter(selectedIp => selectedIp !== ip));
  };

  const refreshConnection = async (ip: string) => {
    if (!isClient) return;

    const index = macMinis.findIndex(m => m.ip === ip);
    if (index === -1) return;

    // Close existing connection if any
    if (macMinis[index].connection) {
      macMinis[index].connection.close();
    }

    const connection = await checkWebSocketConnection(ip);
    const updated = [...macMinis];
    updated[index] = {
      ...updated[index],
      isConnected: !!connection,
      connection: connection || undefined,
    };
    setMacMinis(updated);
    
    // Remove from selectedMacMiniIps if connection failed
    if (!connection) {
      setSelectedMacMiniIps(prev => prev.filter(selectedIp => selectedIp !== ip));
    }
  };

  const checkAllConnections = useCallback(async () => {
    if (!isClient) return;

    const updated = await Promise.all(
      macMinis.map(async (mini) => {
        // Close existing connection if any
        if (mini.connection) {
          mini.connection.close();
        }
        
        const connection = await checkWebSocketConnection(mini.ip);
        return {
          ...mini,
          isConnected: !!connection,
          connection: connection || undefined,
        };
      })
    );

    setMacMinis(updated);
    
    // Filter out selected IPs that are no longer connected
    setSelectedMacMiniIps(prev => 
      prev.filter(ip => updated.some(m => m.ip === ip && m.isConnected))
    );
  }, [isClient, macMinis]);

  const selectMacMini = (ip: string) => {
    const target = macMinis.find(m => m.ip === ip && m.isConnected);
    if (!target) return;

    // Other views support multiple selection
    setSelectedMacMiniIps(prev => 
      prev.includes(ip) ? prev : [...prev, ip]
    );
  };

  const deselectMacMini = (ip: string) => {
    setSelectedMacMiniIps(prev => prev.filter(selectedIp => selectedIp !== ip));
  };

  const handleSetActiveView = (view: ViewType) => {
    setActiveView(view);
    // If switching to tree view with multiple selections, keep only the first one
    if (view === "tree" && selectedMacMiniIps.length > 1) {
      setSelectedMacMiniIps([selectedMacMiniIps[0]]);
    }
  };

  const contextValue: MacMiniContextState = {
    macMinis,
    selectedMacMiniIps,
    selectedMacMinis,
    activeView,
    isClient,
    setMacMinis,
    selectMacMini,
    deselectMacMini,
    setActiveView: handleSetActiveView,
    addMacMini,
    removeMacMini,
    refreshConnection,
    checkAllConnections,
  };

  return (
    <MacMiniContext.Provider value={contextValue}>
      {children}
    </MacMiniContext.Provider>
  );
}

export function useMacMiniContext() {
  return useContext(MacMiniContext);
}