import path from "node:path";

function writableCwdPath(...segments) {
  return path.join(process.cwd(), ...segments);
}

function localAppDataRoot() {
  const value = process.env.LOCALAPPDATA;
  if (value && value.trim().length > 0) {
    return value;
  }

  return null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function resolveAppRootCandidates() {
  const local = localAppDataRoot();
  const candidates = [];

  if (local) {
    candidates.push(path.join(local, "FeatherTalk"));
  }

  candidates.push(writableCwdPath("data", "localappdata", "FeatherTalk"));

  return unique(candidates);
}

export function resolveAppRoot() {
  return resolveAppRootCandidates()[0];
}

export function resolveConfigPathCandidates() {
  return resolveAppRootCandidates().map((root) =>
    path.join(root, "config", "settings.json")
  );
}

export function resolveRecordingsDirCandidates() {
  return resolveAppRootCandidates().map((root) => path.join(root, "recordings"));
}

export function resolveConfigPath() {
  return resolveConfigPathCandidates()[0];
}

export function resolveRecordingsDir() {
  return resolveRecordingsDirCandidates()[0];
}

export function resolveLogsDir() {
  return path.join(resolveAppRoot(), "logs");
}

export function resolveModelsDir() {
  return path.join(resolveAppRoot(), "models");
}

export function resolveHistoryDbPath() {
  return path.join(resolveAppRoot(), "data", "history.db");
}
