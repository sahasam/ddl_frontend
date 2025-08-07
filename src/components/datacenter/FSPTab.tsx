import React, { useEffect, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Users, Clock, Target, Crown, Shield } from 'lucide-react';
import { useDatacenterContext } from '@/context/DatacenterContext';

// State colors mapping
const STATE_COLORS = {
  // Core states
  Q: [240, 240, 240],    // Light gray - Quiescent (most common)
  T: [255, 255, 0],      // BRIGHT YELLOW - FIRING! 🔥
  xx: [0, 0, 0],         // Black - Edge/Invalid
  
  // General states  
  P0: [255, 0, 0],       // Red - General initial
  P1: [255, 100, 100],   // Light red - General secondary
  
  // Border states
  B0: [0, 0, 255],       // Blue - Border primary
  B1: [100, 100, 255],   // Light blue - Border secondary
  
  // Ready states
  R0: [128, 0, 128],     // Purple - Ready primary  
  R1: [200, 100, 200],   // Light purple - Ready secondary
  
  // Action states (green family for progression)
  A0: [0, 255, 0],       // Bright green
  A1: [50, 255, 50],     // Light green
  A2: [0, 200, 0],       // Medium green  
  A3: [100, 255, 100],   // Pale green
  A4: [0, 150, 0],       // Dark green
  A5: [150, 255, 150],   // Very pale green
  A6: [0, 255, 150],     // Green-cyan
  A7: [150, 255, 0],     // Yellow-green
};

const getStateColor = (state: string): string => {
  const color = STATE_COLORS[state as keyof typeof STATE_COLORS];
  if (!color) return 'rgb(128, 128, 128)'; // Default gray
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
};

const getStateRobot = (state: string): string => {
  switch (state) {
    // Core states
    case 'Q': return '🤖💤'; // Sleeping robot - Quiescent
    case 'T': return '🤖💥'; // FIRING! 
    case 'xx': return '🚫🤖'; // Invalid/Edge
    
    // General states
    case 'P0': return '👑🤖'; // General with crown
    case 'P1': return '🤖⚡'; // General powering up
    
    // Border states  
    case 'B0': return '🛡️🤖'; // Robot with shield
    case 'B1': return '🤖🔵'; // Border robot
    
    // Ready states
    case 'R0': return '🤖💪'; // Robot flexing - getting ready
    case 'R1': return '🤖🎯'; // Robot targeting
    
    // Action states - progressive dance moves!
    case 'A0': return '🤖🕺'; // Robot starts dancing
    case 'A1': return '💃🤖'; // Robot spinning
    case 'A2': return '🤖🎵'; // Robot with music
    case 'A3': return '🎶🤖'; // Robot vibing
    case 'A4': return '🤖✨'; // Robot with sparkles
    case 'A5': return '⚡🤖'; // Robot energizing
    case 'A6': return '🤖🌟'; // Robot with stars
    case 'A7': return '🔥🤖'; // Robot almost ready to fire
    
    default: return '🤖❓'; // Unknown state
  }
};

const getStateAnimation = (state: string): string => {
  // Handle null, undefined, or empty states
  if (!state || typeof state !== 'string') {
    return ''; // No animation for invalid states
  }
  
  if (state === 'T') {
    return 'animate-bounce'; // Bounce animation for firing
  } else if (state.startsWith('A')) {
    return 'animate-pulse'; // Pulse animation for action states
  } else if (state.startsWith('P')) {
    return 'animate-ping'; // Ping animation for general states
  }
  return ''; // No animation for other states
};

const getTextColor = (state: string): string => {
  const color = STATE_COLORS[state as keyof typeof STATE_COLORS];
  if (!color) return '#000000';
  
  // Calculate luminance to determine if text should be dark or light
  const [r, g, b] = color;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

const getRoleIcon = (role: string) => {
  switch (role) {
    case 'general':
      return <Crown className="w-4 h-4" />;
    case 'soldier':
      return <Shield className="w-4 h-4" />;
    case 'right_edge':
      return <Target className="w-4 h-4" />;
    default:
      return <Users className="w-4 h-4" />;
  }
};

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case 'general':
      return 'destructive';
    case 'soldier':
      return 'default';
    case 'right_edge':
      return 'secondary';
    default:
      return 'outline';
  }
};

export function FSPTab() {
  const { fspStatus, manualFsp, getAllFspStatus } = useDatacenterContext();
  const [isTriggering, setIsTriggering] = useState(false);
  const [selectedGeneral, setSelectedGeneral] = useState<string>('');

  // Get initial FSP status on mount, then rely on stream updates
  useEffect(() => {
    // Get initial status
    getAllFspStatus();
  }, [getAllFspStatus]);

  const handleManualFsp = async () => {
    if (!selectedGeneral) {
      alert('Please select a general first');
      return;
    }
    setIsTriggering(true);
    manualFsp(selectedGeneral);
    setTimeout(() => setIsTriggering(false), 1000);
  };

  const soldiers = Object.entries(fspStatus).filter(([_, status]: [string, any]) => 
    status && !status.error
  );

  const totalSoldiers = soldiers.length;
  const activeFsp = soldiers.filter(([_, status]: [string, any]) => status.fsp_active).length;
  const topologyEstablished = soldiers.every(([_, status]: [string, any]) => status.topology_established);

  // Auto-select first available cell as general if none selected
  useEffect(() => {
    if (!selectedGeneral && soldiers.length > 0) {
      setSelectedGeneral(soldiers[0][0]);
    }
  }, [soldiers, selectedGeneral]);

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-6 h-6" />
            Firing Squad Protocol
          </h2>
          <p className="text-slate-600 mt-1">
            Real-time FSP status and control
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Select General:</label>
            <select
              value={selectedGeneral}
              onChange={(e) => setSelectedGeneral(e.target.value)}
              className="px-3 py-1 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isTriggering || soldiers.length === 0}
            >
              {soldiers.map(([cellId]) => (
                <option key={cellId} value={cellId}>
                  {cellId}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleManualFsp}
            disabled={isTriggering || !selectedGeneral || soldiers.length === 0}
            className="bg-red-600 hover:bg-red-700"
          >
            <Crown className="w-4 h-4 mr-2" />
            Trigger FSP
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total Soldiers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSoldiers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Active FSP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{activeFsp}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4" />
              Topology
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={topologyEstablished ? "default" : "destructive"}>
              {topologyEstablished ? "Established" : "Not Ready"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-600">
              Live streaming (20Hz)
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Soldiers Grid */}
      {totalSoldiers === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-64 text-slate-500">
            <div className="text-center">
              <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No FSP status available</p>
              <p className="text-sm">Make sure cells are running and FSP is enabled</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {soldiers.map(([cellId, status]: [string, any]) => (
            <Card key={cellId} className="relative overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{cellId}</CardTitle>
                  <Badge variant={getRoleBadgeVariant(status.role)} className="flex items-center gap-1">
                    {getRoleIcon(status.role)}
                    {status.role}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Robot Animation */}
                <div className="flex justify-center">
                  <div className={`text-3xl ${getStateAnimation(status.current_state)}`}>
                    {getStateRobot(status.current_state)}
                  </div>
                </div>

                {/* Current State with color */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">State:</span>
                  <div
                    className="px-3 py-1 rounded-md font-bold text-lg min-w-[60px] text-center"
                    style={{
                      backgroundColor: getStateColor(status.current_state),
                      color: getTextColor(status.current_state)
                    }}
                  >
                    {status.current_state}
                  </div>
                </div>

                {/* Position */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Position:</span>
                  <span className="font-medium">{status.position}</span>
                </div>

                {/* Time Step */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Time Step:</span>
                  <span className="font-medium">{status.time_step}/{status.max_time}</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(status.time_step / status.max_time) * 100}%`
                    }}
                  />
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-1">
                  {status.fsp_active && (
                    <Badge variant="default" className="text-xs bg-yellow-500">
                      FSP Active
                    </Badge>
                  )}
                  {status.topology_established && (
                    <Badge variant="outline" className="text-xs">
                      Topology OK
                    </Badge>
                  )}
                  {status.is_general && (
                    <Badge variant="destructive" className="text-xs">
                      General
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}