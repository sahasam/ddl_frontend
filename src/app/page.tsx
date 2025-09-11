// src/app/page.tsx
"use client";

import { MacMiniProvider } from "@/context/MacMiniContext";
//import DashboardContent from "@/components/DashboardContent";
import DatacenterApp from '@/components/DatacenterApp';


export default function Page() {
  return <DatacenterApp />;
}