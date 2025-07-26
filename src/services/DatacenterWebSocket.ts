// services/DatacenterWebSocket.ts
export class DatacenterWebSocket {
    private ws: WebSocket | null = null;
    private url: string;
    private messageHandlers: Set<(message: any) => void> = new Set();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
  
    constructor(url: string = 'ws://localhost:8765') {
      this.url = url;
    }
  
    connect(): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          this.ws = new WebSocket(this.url);
          
          this.ws.onopen = () => {
            console.log('Connected to datacenter server');
            this.reconnectAttempts = 0;
            resolve();
          };
  
          this.ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              this.messageHandlers.forEach(handler => handler(message));
            } catch (e) {
              console.error('Failed to parse message:', e);
            }
          };
  
          this.ws.onclose = () => {
            console.log('Disconnected from datacenter server');
            this.attemptReconnect();
          };
  
          this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            reject(error);
          };
  
        } catch (error) {
          reject(error);
        }
      });
    }
  
    private attemptReconnect() {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
        setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
      }
    }
  
    sendCommand(command: string, params: any = {}): void {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not connected');
        return;
      }
  
      const message = {
        command,
        params
      };
  
      this.ws.send(JSON.stringify(message));
    }
  
    addMessageHandler(handler: (message: any) => void): () => void {
      this.messageHandlers.add(handler);
      return () => this.messageHandlers.delete(handler);
    }
  
    disconnect() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
  
    isConnected(): boolean {
      return this.ws?.readyState === WebSocket.OPEN;
    }
  }