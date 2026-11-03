import { existsSync, mkdirSync, writeFileSync, renameSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

export class WholeshareStorageDriver {
  constructor() {
    const customMount = process.env.JUICEFS_MOUNT_PATH || process.env.WHOLESHARE_STORAGE_DIR;
    if (customMount && existsSync(customMount)) {
      this.driverType = "juicefs";
      this.rootDir = resolve(customMount);
    } else {
      this.driverType = "local_posix";
      this.rootDir = resolve(process.cwd(), "data");
    }

    this.lakeDir = resolve(this.rootDir, "lake");
    this.memoryDir = resolve(this.rootDir, "memory");
    this.ensureBaseLayout();
  }

  ensureBaseLayout() {
    const dirs = [
      this.lakeDir,
      resolve(this.lakeDir, "bronze"),
      resolve(this.lakeDir, "silver"),
      resolve(this.lakeDir, "gold"),
      this.memoryDir,
      resolve(this.memoryDir, "entities"),
      resolve(this.memoryDir, "knowledge")
    ];

    for (const d of dirs) {
      if (!existsSync(d)) {
        mkdirSync(d, { recursive: true });
      }
    }
  }

  getLakePath(partition, filename) {
    return resolve(this.lakeDir, partition, filename);
  }

  getMemoryEntityPath(entityId) {
    const cleanId = entityId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return resolve(this.memoryDir, "entities", `${cleanId}.md`);
  }

  writeAtomic(targetPath, content) {
    const dir = dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, targetPath);
  }

  writeBinaryAtomic(targetPath, buffer) {
    const dir = dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmpPath, buffer);
    renameSync(tmpPath, targetPath);
  }

  readSafe(targetPath) {
    if (!existsSync(targetPath)) {
      return null;
    }
    return readFileSync(targetPath, "utf-8");
  }

  listPartitionFiles(partition) {
    const dir = resolve(this.lakeDir, partition);
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir);
  }

  getDiagnostics() {
    let stats = null;
    try {
      stats = statSync(this.rootDir);
    } catch {
      stats = null;
    }

    return {
      driver: this.driverType,
      rootDir: this.rootDir,
      lakeDir: this.lakeDir,
      memoryDir: this.memoryDir,
      isJuiceFs: this.driverType === "juicefs",
      atomicRenameSupported: true,
      posixLocksSupported: true,
      stats: stats ? { isDirectory: stats.isDirectory(), mode: stats.mode } : null
    };
  }
}

export const storageDriver = new WholeshareStorageDriver();

