// Adds sample IT assets for local demos. Non-destructive: inserts only asset
// tags that do not exist yet and never modifies or deletes existing assets.
//   npm run seed:inventory
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Asset } from '../models/Asset.js';

const SAMPLE_ASSETS = [
  { assetTag: 'PC-LAB1-001', name: 'Lab 1 Desktop 01', category: 'standard_computer', manufacturer: 'Dell', model: 'OptiPlex 7010',
    specs: { cpuCores: 8, memoryGb: 16, storageGb: 512, storageType: 'ssd', formFactor: 'desktop' }, operatingSystem: 'Windows 11', location: 'Lab 1' },
  { assetTag: 'PC-LAB1-002', name: 'Lab 1 Desktop 02', category: 'standard_computer', manufacturer: 'Dell', model: 'OptiPlex 7010',
    specs: { cpuCores: 8, memoryGb: 16, storageGb: 512, storageType: 'ssd', formFactor: 'desktop' }, operatingSystem: 'Windows 11', location: 'Lab 1' },
  { assetTag: 'LT-STAFF-010', name: 'Staff Laptop 10', category: 'standard_computer', manufacturer: 'Lenovo', model: 'ThinkPad T14',
    specs: { cpuCores: 10, memoryGb: 32, storageGb: 1000, storageType: 'nvme', formFactor: 'laptop' }, operatingSystem: 'Ubuntu 22.04', location: 'IT Store' },
  { assetTag: 'WS-CAD-003', name: 'CAD Workstation 03', category: 'workstation', manufacturer: 'HP', model: 'Z4 G5',
    specs: { cpuCores: 16, memoryGb: 64, storageGb: 2000, storageType: 'nvme', gpuModel: 'NVIDIA RTX A4000', gpuMemoryGb: 16 }, operatingSystem: 'Windows 11 Pro', location: 'Design Lab' },
  { assetTag: 'GPU-ML-001', name: 'ML Training Node 1', category: 'gpu_system', manufacturer: 'Supermicro', model: 'SYS-740GP',
    specs: { gpuModel: 'NVIDIA A100', gpuCount: 4, gpuMemoryGb: 80, cpuCores: 64, memoryGb: 512, storageGb: 8000, operatingSystem: 'Ubuntu 22.04' }, operatingSystem: 'Ubuntu 22.04', location: 'Data Centre Rack B2' },
  { assetTag: 'SRV-WEB-002', name: 'Web Server 02', category: 'server', manufacturer: 'Dell', model: 'PowerEdge R650',
    specs: { cpuCores: 32, memoryGb: 128, storageGb: 4000, storageType: 'ssd', networkSpeedGbps: 10 }, operatingSystem: 'Rocky Linux 9', location: 'Data Centre Rack A1' },
  { assetTag: 'NET-SW-014', name: '24-port Switch 14', category: 'networking', manufacturer: 'Cisco', model: 'CBS350-24T',
    specs: { networkPorts: 24, networkSpeedGbps: 1 }, location: 'IT Store' },
  { assetTag: 'STO-NAS-001', name: 'Department NAS 1', category: 'storage', manufacturer: 'Synology', model: 'DS923+',
    specs: { storageGb: 16000, storageType: 'hdd' }, location: 'IT Store', status: 'maintenance', notes: 'Disk replacement in progress' }
];

try {
  await connectDb();
  const ops = SAMPLE_ASSETS.map(a => ({ updateOne: { filter: { assetTag: a.assetTag }, update: { $setOnInsert: a }, upsert: true } }));
  const res = await Asset.bulkWrite(ops);
  console.log(`Inserted ${res.upsertedCount} new asset(s); ${SAMPLE_ASSETS.length - res.upsertedCount} already existed and were left unchanged.`);
} finally {
  await mongoose.disconnect();
}
