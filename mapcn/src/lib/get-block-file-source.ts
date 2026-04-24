import fs from "fs";
import path from "path";

const SRC_DIR = process.cwd();

export function getBlockFileSource(registryPath: string): string {
  const filePath = path.join(SRC_DIR, registryPath);
  const source = fs.readFileSync(filePath, "utf-8");

  return source.replace(/@\/registry\/map/g, "@/components/ui/map");
}
