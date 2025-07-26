import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, Download, Trash2 } from 'lucide-react';
import { useDatacenterContext } from '@/context/DatacenterContext';

interface TopologyUploadProps {
  onUploadSuccess?: () => void;
}

export function TopologyUpload({ onUploadSuccess }: TopologyUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
  const datacenterWS = useDatacenterContext();

  const handleFileSelect = (file: File) => {
    if (file.type === 'application/x-yaml' || file.type === 'text/yaml' || file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
      setSelectedFile(file);
    } else {
      alert('Please select a YAML file (.yaml or .yml)');
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const uploadTopology = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    try {
      const fileContent = await selectedFile.text();
      
      // Send upload command to your datacenter WebSocket
      datacenterWS.sendCommand?.('upload_topology', {
        filename: selectedFile.name,
        content: fileContent
      });
      
      setSelectedFile(null);
      onUploadSuccess?.();
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Failed to upload topology:', error);
      alert('Failed to upload topology file');
    } finally {
      setUploading(false);
    }
  };

  const downloadCurrentTopology = async () => {
    try {
      // Send save command to get current topology
      datacenterWS.sendCommand?.('save_topology', {
        filename: 'current_topology.yaml'
      });
      
      // Note: You'd need to handle the response in your WebSocket context
      // and trigger a download. For now, this just sends the command.
      
    } catch (error) {
      console.error('Failed to download topology:', error);
      alert('Failed to download current topology');
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Topology Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragOver 
              ? 'border-blue-400 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {selectedFile ? (
            <div className="space-y-3">
              <FileText className="w-8 h-8 mx-auto text-blue-500" />
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={uploadTopology}
                  disabled={uploading}
                  className="text-sm"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  {uploading ? 'Uploading...' : 'Upload Topology'}
                </Button>
                <Button
                  onClick={clearSelection}
                  variant="outline"
                  className="text-sm"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Upload className="w-8 h-8 mx-auto text-gray-400" />
              <div>
                <p className="text-lg font-medium">Drop topology file here</p>
                <p className="text-sm text-gray-500">or click to browse</p>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
              >
                Browse Files
              </Button>
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Download Current Topology */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Current Topology</h4>
              <p className="text-sm text-gray-500">
                Download the current datacenter configuration
              </p>
            </div>
            <Button
              onClick={downloadCurrentTopology}
              variant="outline"
              className="text-sm"
            >
              <Download className="w-4 h-4 mr-1" />
              Download
            </Button>
          </div>
        </div>

        {/* Example Topology Format */}
        <div className="border-t pt-4">
          <h4 className="font-medium mb-2">Example Topology Format</h4>
          <div className="bg-gray-50 p-3 rounded text-xs font-mono">
            <pre>{`topology:
  cells:
    - id: cell1
      rpc_port: 9001
      host: localhost
    - id: cell2
      rpc_port: 9002
      host: localhost
  links:
    - cell1: cell1
      port1: p0
      cell2: cell2
      port2: p1
      addr1: "127.0.0.1:5000:5001"
      addr2: "127.0.0.1:5001:5000"`}</pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}