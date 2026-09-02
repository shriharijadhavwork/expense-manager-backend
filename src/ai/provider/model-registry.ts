import { aiConfig } from "../config.js";

export type ModelTier = "lite" | "standard";

const LITE_CALL_SITES = new Set(["classify_intent", "build_reply"]);

export function getModelTierForCallSite(callSite: string): ModelTier {
  return LITE_CALL_SITES.has(callSite) ? "lite" : "standard";
}

function uniqueModels(models: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const model of models) {
    const normalized = model.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

export function getModelCandidates(
  callSite: string,
  excludedModels: string[] = [],
): string[] {
  const excluded = new Set(excludedModels.map((model) => model.trim()));
  const tier = getModelTierForCallSite(callSite);
  const primary =
    tier === "lite" ? aiConfig.geminiModelLite : aiConfig.geminiModelStandard;

  const candidates = uniqueModels([
    primary,
    ...aiConfig.geminiModelFallbackChain,
  ]);

  if (!aiConfig.modelFallbackEnabled) {
    const first = candidates.find((model) => !excluded.has(model));
    return first ? [first] : [];
  }

  return candidates.filter((model) => !excluded.has(model));
}
