// Additive, repeatable demo inventory for isolated testing.
// This script never updates or deletes existing assets.
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Asset } from '../models/Asset.js';

const DEMO_ASSETS = [
  {
    assetTag: 'DEMO-WS-COMPAT-001',
    name: 'Demo ML Workstation Compatible',
    category: 'workstation',
    manufacturer: 'Lenovo',
    model: 'ThinkStation P620',
    specs: { cpuCores: 16, memoryGb: 64, storageGb: 2000, storageType: 'nvme', gpuModel: 'NVIDIA RTX 4090', gpuMemoryGb: 24 },
    operatingSystem: 'Ubuntu 22.04',
    location: 'Research Lab',
    department: 'Computer Science'
  },
  {
    assetTag: 'DEMO-WS-HIGH-001',
    name: 'Demo ML Workstation Higher Spec',
    category: 'workstation',
    manufacturer: 'Dell',
    model: 'Precision 7960',
    specs: { cpuCores: 32, memoryGb: 128, storageGb: 4000, storageType: 'nvme', gpuModel: 'NVIDIA RTX 6000 Ada', gpuMemoryGb: 48 },
    operatingSystem: 'Ubuntu 22.04',
    location: 'Research Lab',
    department: 'Research Lab'
  },
  {
    assetTag: 'DEMO-WS-LOW-001',
    name: 'Demo ML Workstation Insufficient',
    category: 'workstation',
    manufacturer: 'HP',
    model: 'Z2 G9',
    specs: { cpuCores: 8, memoryGb: 16, storageGb: 1000, storageType: 'ssd', gpuModel: 'NVIDIA GTX 1660', gpuMemoryGb: 6 },
    operatingSystem: 'Ubuntu 22.04',
    location: 'Teaching Lab',
    department: 'Electronics'
  },
  {
    assetTag: 'DEMO-WS-GPU-001',
    name: 'Demo ML Workstation GPU Incompatible',
    category: 'workstation',
    manufacturer: 'ASUS',
    model: 'ProArt Station',
    specs: { cpuCores: 16, memoryGb: 64, storageGb: 2000, storageType: 'ssd', gpuModel: 'NVIDIA RTX A2000', gpuMemoryGb: 8 },
    operatingSystem: 'Windows 11 Pro',
    location: 'Design Lab',
    department: 'Electronics'
  },
  {
    assetTag: 'DEMO-PC-STANDARD-001',
    name: 'Demo Standard Desktop',
    category: 'standard_computer',
    manufacturer: 'Dell',
    model: 'OptiPlex 7010',
    specs: { cpuCores: 8, memoryGb: 16, storageGb: 512, storageType: 'ssd', formFactor: 'desktop' },
    operatingSystem: 'Windows 11',
    location: 'IT Store',
    department: 'Computer Science'
  },
  {
    assetTag: 'DEMO-PC-LAPTOP-001',
    name: 'Demo Standard Laptop',
    category: 'standard_computer',
    manufacturer: 'Lenovo',
    model: 'ThinkPad T14',
    specs: { cpuCores: 10, memoryGb: 32, storageGb: 1000, storageType: 'nvme', formFactor: 'laptop' },
    operatingSystem: 'Ubuntu 22.04',
    location: 'IT Store',
    department: 'Research Lab'
  },
  {
    assetTag: 'DEMO-SRV-APP-001',
    name: 'Demo Application Server',
    category: 'server',
    manufacturer: 'Dell',
    model: 'PowerEdge R650',
    specs: { cpuCores: 32, memoryGb: 128, storageGb: 4000, storageType: 'ssd', networkSpeedGbps: 10 },
    operatingSystem: 'Rocky Linux 9',
    location: 'Data Centre Rack A1',
    department: 'Computer Science'
  },
  {
    assetTag: 'DEMO-SRV-DATA-001',
    name: 'Demo Data Server',
    category: 'server',
    manufacturer: 'HPE',
    model: 'ProLiant DL380',
    specs: { cpuCores: 48, memoryGb: 256, storageGb: 12000, storageType: 'nvme', networkSpeedGbps: 25 },
    operatingSystem: 'Ubuntu 22.04',
    location: 'Data Centre Rack A2',
    department: 'Research Lab'
  },
  {
    assetTag: 'DEMO-NET-SW-001',
    name: 'Demo Access Switch',
    category: 'networking',
    manufacturer: 'Cisco',
    model: 'CBS350-24T',
    specs: { networkPorts: 24, networkSpeedGbps: 1 },
    location: 'IT Store',
    department: 'Electronics'
  },
  {
    assetTag: 'DEMO-NET-SW-002',
    name: 'Demo Core Switch',
    category: 'networking',
    manufacturer: 'Arista',
    model: '7050X',
    specs: { networkPorts: 48, networkSpeedGbps: 10 },
    location: 'Data Centre Rack C1',
    department: 'Computer Science'
  },
  {
    assetTag: 'DEMO-STO-HDD-001',
    name: 'Demo HDD NAS',
    category: 'storage',
    manufacturer: 'Synology',
    model: 'DS923+',
    specs: { storageGb: 16000, storageType: 'hdd' },
    location: 'IT Store',
    department: 'Research Lab'
  },
  {
    assetTag: 'DEMO-STO-NVME-001',
    name: 'Demo NVMe Storage Array',
    category: 'storage',
    manufacturer: 'Dell',
    model: 'PowerVault ME5',
    specs: { storageGb: 32000, storageType: 'nvme' },
    location: 'Data Centre Rack C2',
    department: 'Computer Science'
  },
  {
    assetTag: 'DEMO-WS-INCOMPLETE-001',
    name: 'Demo Workstation Incomplete Record',
    category: 'workstation',
    manufacturer: 'Apple',
    model: 'Mac Pro',
    operatingSystem: 'macOS',
    location: 'IT Store',
    department: 'Electronics',
    notes: 'Intentionally incomplete specifications for unverified matching tests'
  }
];

function validateDemoAsset(candidate) {
  const asset = new Asset(candidate);
  return asset.validate();
}

let exitCode = 0;
try {
  await connectDb();
  const inserted = [];
  const alreadyExisting = [];
  const skipped = [];

  for (const candidate of DEMO_ASSETS) {
    try {
      await validateDemoAsset(candidate);
    } catch (error) {
      skipped.push({ assetTag: candidate.assetTag, reason: error.message });
      continue;
    }

    const existing = await Asset.exists({ assetTag: candidate.assetTag });
    if (existing) {
      alreadyExisting.push(candidate.assetTag);
      continue;
    }

    try {
      await Asset.create(candidate);
      inserted.push(candidate.assetTag);
    } catch (error) {
      if (error?.code === 11000) {
        alreadyExisting.push(candidate.assetTag);
      } else {
        skipped.push({ assetTag: candidate.assetTag, reason: error.message });
      }
    }
  }

  console.log(JSON.stringify({
    inserted,
    alreadyExisting,
    skipped,
    totals: {
      inserted: inserted.length,
      alreadyExisting: alreadyExisting.length,
      skipped: skipped.length
    }
  }, null, 2));
  if (skipped.length) exitCode = 1;
} catch (error) {
  console.error(`Demo inventory setup failed: ${error.message}`);
  exitCode = 1;
} finally {
  await mongoose.disconnect();
  process.exitCode = exitCode;
}
