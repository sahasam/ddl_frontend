import React, { useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, MessageSquare, Trash2, RefreshCw, Radio, MessageCircle, Clock, User } from 'lucide-react';
import { useDatacenterContext } from '@/context/DatacenterContext';

interface Message {
  source: string;
  payload: string;
  timestamp: number;
  message_id: string;
}

interface CellMessages {
  [cellId: string]: Message[];
}

export function MessagingTab() {
  const { cells, sendMessage, getMessages, broadcastMessage, clearMessage, sendCommand } = useDatacenterContext();
  const [selectedFromCell, setSelectedFromCell] = useState<string>('');
  const [selectedToCell, setSelectedToCell] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [broadcastCell, setBroadcastCell] = useState<string>('');
  const [broadcastMessageText, setBroadcastMessageText] = useState<string>('');
  const [viewingCell, setViewingCell] = useState<string>('');
  const [filterFromCell, setFilterFromCell] = useState<string>('all');
  const [cellMessages, setCellMessages] = useState<CellMessages>({});
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const cellIds = Object.keys(cells);
  const aliveCells = cellIds.filter(id => cells[id]?.status === 'alive');

  // Auto-refresh messages
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (viewingCell && aliveCells.includes(viewingCell)) {
        refreshMessages(viewingCell);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh, viewingCell, aliveCells, filterFromCell]);

  // Refresh messages when filter changes
  useEffect(() => {
    if (viewingCell && aliveCells.includes(viewingCell)) {
      refreshMessages(viewingCell);
    }
  }, [filterFromCell, viewingCell]);

  const refreshMessages = (cellId: string) => {
    if (!cellId) return;
    getMessages(cellId, filterFromCell === "all" ? null : filterFromCell);
  };

  // Listen for message responses from WebSocket
  useEffect(() => {
    const handleMessagesUpdate = (event: CustomEvent) => {
      const { cellId, messages } = event.detail;
      setCellMessages(prev => ({
        ...prev,
        [cellId]: messages
      }));
    };

    const handleMessagesCleared = (event: CustomEvent) => {
      const { cellId } = event.detail;
      setCellMessages(prev => ({
        ...prev,
        [cellId]: []
      }));
    };

    window.addEventListener('cellMessagesUpdated', handleMessagesUpdate as EventListener);
    window.addEventListener('cellMessagesCleared', handleMessagesCleared as EventListener);
    
    return () => {
      window.removeEventListener('cellMessagesUpdated', handleMessagesUpdate as EventListener);
      window.removeEventListener('cellMessagesCleared', handleMessagesCleared as EventListener);
    };
  }, []);

  const handleSendMessage = () => {
    if (!selectedFromCell || !selectedToCell || !message.trim()) return;
    
    sendMessage(selectedFromCell, selectedToCell, message.trim());
    setMessage('');
    
    // Refresh messages for both cells after a short delay
    setTimeout(() => {
      if (viewingCell === selectedFromCell || viewingCell === selectedToCell) {
        refreshMessages(viewingCell);
      }
    }, 500);
  };

  const handleBroadcast = () => {
    if (!broadcastCell || !broadcastMessageText.trim()) return;
    
    broadcastMessage(broadcastCell, broadcastMessageText.trim());
    setBroadcastMessageText('');
    
    // Refresh messages after broadcast
    setTimeout(() => {
      if (viewingCell) {
        refreshMessages(viewingCell);
      }
    }, 500);
  };

  const handleClearMessages = (cellId: string) => {
    clearMessage(cellId);
    // The context will dispatch an event when messages are cleared successfully
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  const getMessageStats = () => {
    const totalMessages = Object.values(cellMessages).reduce((sum, msgs) => sum + msgs.length, 0);
    const cellsWithMessages = Object.keys(cellMessages).filter(cellId => cellMessages[cellId]?.length > 0).length;
    return { totalMessages, cellsWithMessages };
  };

  const { totalMessages, cellsWithMessages } = getMessageStats();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-6 h-6" />
            Inter-Cell Messaging
          </h2>
          <p className="text-slate-600 mt-1">
            Send messages between cells and monitor communication
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="px-3 py-1">
            <MessageCircle className="w-4 h-4 mr-1" />
            {totalMessages} total messages
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            <User className="w-4 h-4 mr-1" />
            {cellsWithMessages} cells with messages
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="send" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="send" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Send Message
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="flex items-center gap-2">
            <Radio className="w-4 h-4" />
            Broadcast
          </TabsTrigger>
          <TabsTrigger value="view" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            View Messages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Send Point-to-Point Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">From Cell</label>
                  <Select value={selectedFromCell} onValueChange={setSelectedFromCell}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source cell" />
                    </SelectTrigger>
                    <SelectContent>
                      {aliveCells.map(cellId => (
                        <SelectItem key={cellId} value={cellId}>
                          {cellId} ({cells[cellId]?.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">To Cell</label>
                  <Select value={selectedToCell} onValueChange={setSelectedToCell}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination cell" />
                    </SelectTrigger>
                    <SelectContent>
                      {aliveCells.filter(id => id !== selectedFromCell).map(cellId => (
                        <SelectItem key={cellId} value={cellId}>
                          {cellId} ({cells[cellId]?.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Message</label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter your message..."
                  rows={3}
                />
              </div>
              <Button 
                onClick={handleSendMessage}
                disabled={!selectedFromCell || !selectedToCell || !message.trim()}
                className="w-full"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="broadcast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="w-5 h-5" />
                Broadcast Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">From Cell</label>
                <Select value={broadcastCell} onValueChange={setBroadcastCell}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select broadcasting cell" />
                  </SelectTrigger>
                  <SelectContent>
                    {aliveCells.map(cellId => (
                      <SelectItem key={cellId} value={cellId}>
                        {cellId} ({cells[cellId]?.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Broadcast Message</label>
                <Textarea
                  value={broadcastMessageText}
                  onChange={(e) => setBroadcastMessageText(e.target.value)}
                  placeholder="Enter broadcast message..."
                  rows={3}
                />
              </div>
              <Button 
                onClick={handleBroadcast}
                disabled={!broadcastCell || !broadcastMessageText.trim()}
                className="w-full"
              >
                <Radio className="w-4 h-4 mr-2" />
                Broadcast to All Cells
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="view" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                View Cell Messages
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">Cell to View</label>
                  <Select value={viewingCell} onValueChange={setViewingCell}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cell to view messages" />
                    </SelectTrigger>
                    <SelectContent>
                      {aliveCells.map(cellId => (
                        <SelectItem key={cellId} value={cellId}>
                          {cellId} ({cells[cellId]?.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">Filter by Source (Optional)</label>
                  <Select value={filterFromCell} onValueChange={setFilterFromCell}>
                    <SelectTrigger>
                      <SelectValue placeholder="All sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      {aliveCells.filter(id => id !== viewingCell).map(cellId => (
                        <SelectItem key={cellId} value={cellId}>
                          {cellId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => viewingCell && refreshMessages(viewingCell)}
                    disabled={!viewingCell}
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button 
                    onClick={() => viewingCell && handleClearMessages(viewingCell)}
                    disabled={!viewingCell}
                    variant="destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoRefresh"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="autoRefresh" className="text-sm">
                  Auto-refresh every 2 seconds
                </label>
              </div>

              {viewingCell && (
                <div className="border rounded-lg p-4 bg-slate-50 max-h-96 overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Messages for {viewingCell}</h3>
                    <Badge variant="outline">
                      {cellMessages[viewingCell]?.length || 0} messages
                    </Badge>
                  </div>
                  
                  {!cellMessages[viewingCell] || cellMessages[viewingCell].length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No messages found</p>
                      <p className="text-sm">Click refresh to check for new messages</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cellMessages[viewingCell].map((msg, index) => (
                        <div key={`${msg.message_id}-${index}`} className="bg-white p-3 rounded border">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="secondary" className="text-xs">
                              From: {msg.source}
                            </Badge>
                            <div className="flex items-center text-xs text-slate-500">
                              <Clock className="w-3 h-3 mr-1" />
                              {formatTimestamp(msg.timestamp)}
                            </div>
                          </div>
                          <p className="text-sm bg-slate-50 p-2 rounded font-mono">
                            {msg.payload}
                          </p>
                          <div className="text-xs text-slate-400 mt-1">
                            ID: {msg.message_id}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}