import type { ProjectFile } from "@/lib/db-types";

/** URL に ?version= / ?v= があり、明示的にその fileId の稿を見る指定があるか */
export function isVersionExplicit(search: string): boolean {
  const params = new URLSearchParams(search);
  return !!(params.get("version") || params.get("v"));
}

/** 同一 root 系統の versions から version_number 最大の行を返す */
export function getLatestVersionFile(file: ProjectFile, versions: ProjectFile[]): ProjectFile {
  if (versions.length === 0) return file;
  return versions.reduce(
    (acc, v) => ((v.version_number ?? 1) > (acc.version_number ?? 1) ? v : acc),
    versions[0]
  );
}

/** 画面表示・AIチェック実行の対象稿（明示指定時は URL の file、それ以外は最新稿） */
export function resolveActiveFile(file: ProjectFile, versions: ProjectFile[], search: string): ProjectFile {
  if (isVersionExplicit(search)) return file;
  if (versions.length <= 1) return file;
  const latest = getLatestVersionFile(file, versions);
  return latest.id !== file.id ? latest : file;
}

/** ProjectPage 遷移用: root を含む系統の最新稿 id */
export function getLatestVersionId(rootFile: ProjectFile, allFiles: ProjectFile[]): string {
  const siblings = allFiles.filter((f) => f.id === rootFile.id || f.parent_file_id === rootFile.id);
  const latest = siblings.reduce(
    (acc, f) => ((f.version_number ?? 1) > (acc.version_number ?? 1) ? f : acc),
    rootFile
  );
  return latest.id;
}

/** 一括チェック用: root 行を最新稿に解決（子バージョンがあればそちらを対象に） */
export function resolveBatchCheckTarget(rootFile: ProjectFile, allFiles: ProjectFile[]): ProjectFile {
  return getLatestVersionFile(rootFile, allFiles.filter(
    (f) => f.id === rootFile.id || f.parent_file_id === rootFile.id
  ));
}
