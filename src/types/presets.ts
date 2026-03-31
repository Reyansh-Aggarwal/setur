export interface AppEntry {
  name: string;
  path: string;
}

export interface AppInfo {
  name: string;
  path: string;
  icon_path?: string | null;
}

export interface Preset {
  id: string;
  name: string;
  icon?: string | null;
  apps: AppEntry[];
  urls: string[];
}
