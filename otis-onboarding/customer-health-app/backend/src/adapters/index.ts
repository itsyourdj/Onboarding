import { config } from "../config.js";
import { PostgresAdapter } from "./PostgresAdapter.js";
import { SemanticLayerAdapter } from "./SemanticLayerAdapter.js";
import type { DataAdapter } from "./types.js";

let adapter: DataAdapter | null = null;

export function getAdapter(): DataAdapter {
  if (adapter) return adapter;
  adapter =
    config.dataSource === "semantic"
      ? new SemanticLayerAdapter()
      : new PostgresAdapter();
  return adapter;
}
