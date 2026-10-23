export const MODULE_ID = "t20-toolkit";
export const MODULE_VERSION = "0.11.0-beta.1";
export const ENGENHOCAS_ENGINE_VERSION = "0.43.0";

export const FLAG_SCOPE = "tormenta20";
export const FLAG_KEY = "engenhoca";

export const SUPPORTED = Object.freeze({
  foundry: "13",
  systemId: "tormenta20",
  systemVersion: "1.5.015"
});

export const ENGINE_VERSIONS = Object.freeze({
  creator: "4.13.0-module",
  activator: "3.5.1-module",
  apparatus: "2.3.0-module"
});

// Historical names kept only for diagnostics/migration. None are runtime dependencies.
export const LEGACY_MACROS = Object.freeze({
  creator: "CRIADOR DE ENGENHOCAS v4.0-alpha9",
  activator: "Ativar Engenhoca",
  apparatus: "Gerenciar Aparatos",
  directUse: "Inicializar Uso Direto de Engenhocas"
});
