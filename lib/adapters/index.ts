import type { Adapters } from "@/lib/pipeline/types";
import { mockAdapters } from "@/lib/adapters/mock";
import { realAdapters } from "@/lib/adapters/real";
import { env } from "@/lib/env";

export function getAdapters(): Adapters {
  return env.MOCK_EXTERNAL ? mockAdapters : realAdapters;
}

export { mockAdapters, realAdapters };
