import type {
  PluginFunctionName,
  PluginManifest,
  PluginRegistryItem,
} from "@/sources/types";

const FUNCTION_NAMES: PluginFunctionName[] = [
  "getManifest",
  "getHomeSections",
  "getPrimaryCategories",
  "getFilterConfig",
  "getUrlList",
  "getUrlSearch",
  "getUrlDetail",
  "getUrlCategories",
  "getUrlCountries",
  "getUrlYears",
  "parseListResponse",
  "parseSearchResponse",
  "parseMovieDetail",
  "parseDetailResponse",
  "parseEmbedResponse",
  "parseCategoriesResponse",
  "parseCountriesResponse",
  "parseYearsResponse",
];

type PluginCallable = (...args: string[]) => unknown;

export class LoadedPlugin {
  readonly item: PluginRegistryItem;
  private readonly functions: Partial<Record<PluginFunctionName, PluginCallable>>;

  constructor(
    item: PluginRegistryItem,
    functions: Partial<Record<PluginFunctionName, PluginCallable>>,
  ) {
    this.item = item;
    this.functions = functions;
  }

  has(name: PluginFunctionName) {
    return typeof this.functions[name] === "function";
  }

  call(name: PluginFunctionName, ...args: string[]) {
    const fn = this.functions[name];

    if (!fn) {
      throw new Error(`Plugin ${this.item.id} does not implement ${name}().`);
    }

    const result = fn(...args);
    return typeof result === "string" ? result : JSON.stringify(result ?? null);
  }

  callJson<T>(name: PluginFunctionName, ...args: string[]) {
    const raw = this.call(name, ...args);
    return parsePluginJson<T>(raw, `${this.item.id}.${name}`);
  }

  getManifest(): PluginManifest {
    if (!this.has("getManifest")) {
      return {
        id: this.item.id,
        name: this.item.name,
        version: this.item.version,
        iconUrl: this.item.iconUrl,
      };
    }

    return this.callJson<PluginManifest>("getManifest");
  }
}

export function createPluginRuntime(
  item: PluginRegistryItem,
  script: string,
): LoadedPlugin {
  const functionMapSource = FUNCTION_NAMES.map(
    (name) => `${JSON.stringify(name)}: typeof ${name} === "function" ? ${name} : undefined`,
  ).join(",\n");

  const factory = new Function(`
    "use strict";
    ${script}
    return {
      ${functionMapSource}
    };
  `) as () => Partial<Record<PluginFunctionName, PluginCallable>>;

  return new LoadedPlugin(item, factory());
}

export function parsePluginJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Invalid JSON returned from ${label}: ${String(error)}`);
  }
}

