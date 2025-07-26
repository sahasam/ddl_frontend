import React from 'react';
import { DatacenterProvider } from '@/context/DatacenterContext';
import { DatacenterDashboard } from './datacenter/DatacenterDashboard';

export default function DatacenterApp() {
  return (
    <DatacenterProvider>
      <DatacenterDashboard />
    </DatacenterProvider>
  );
}