use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconEvent;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
use winreg::{enums::*, RegKey};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppEntry {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub apps: Vec<AppEntry>,
    pub urls: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
    pub icon_path: Option<String>,
}

fn get_presets_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    // Ensure the directory exists
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    path.push("presets.json");
    Ok(path)
}

mod commands {
    use super::*;
    use std::process::Command;
    use tauri_plugin_opener::OpenerExt;

    #[tauri::command]
    pub fn load_presets(app_handle: AppHandle) -> Result<Vec<Preset>, String> {
        let path = get_presets_path(&app_handle)?;

        if !path.exists() {
            return Ok(Vec::new());
        }

        let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let presets: Vec<Preset> = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        Ok(presets)
    }

    #[tauri::command]
    pub fn save_preset(app_handle: AppHandle, preset: Preset) -> Result<(), String> {
        let path = get_presets_path(&app_handle)?;
        let mut presets = load_presets(app_handle.clone())?;

        if let Some(index) = presets.iter().position(|p| p.id == preset.id) {
            presets[index] = preset;
        } else {
            presets.push(preset);
        }

        let data = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn delete_preset(app_handle: AppHandle, id: String) -> Result<(), String> {
        let path = get_presets_path(&app_handle)?;
        let mut presets = load_presets(app_handle.clone())?;

        presets.retain(|p| p.id != id);

        let data = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn reorder_presets(app_handle: AppHandle, ids: Vec<String>) -> Result<(), String> {
        let path = get_presets_path(&app_handle)?;
        let presets = load_presets(app_handle.clone())?;

        let mut reordered: Vec<Preset> = Vec::new();
        for id in ids {
            if let Some(preset) = presets.iter().find(|p| p.id == id) {
                reordered.push(preset.clone());
            }
        }

        let data = serde_json::to_string_pretty(&reordered).map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn launch_preset(app_handle: AppHandle, id: String) -> Result<Vec<String>, String> {
        let presets = load_presets(app_handle.clone())?;
        let preset = presets
            .iter()
            .find(|p| p.id == id)
            .ok_or_else(|| format!("Preset with ID {} not found", id))?;

        let mut failed_items = Vec::new();

        // Launch Apps
        for app in &preset.apps {
            let result = if cfg!(target_os = "windows") {
                Command::new("cmd")
                    .args(["/C", "start", "", &app.path])
                    .spawn()
            } else {
                Command::new("open").arg(&app.path).spawn()
            };

            if let Err(_) = result {
                failed_items.push(app.name.clone());
            }
        }

        // Launch URLs
        for url in &preset.urls {
            if let Err(_) = app_handle.opener().open_url(url, None::<&str>) {
                failed_items.push(url.clone());
            }
        }

        Ok(failed_items)
    }

    #[tauri::command]
    pub fn is_first_launch(app_handle: AppHandle) -> bool {
        match load_presets(app_handle) {
            Ok(presets) => presets.is_empty(),
            Err(_) => true,
        }
    }

    #[tauri::command]
    pub fn get_installed_apps() -> Vec<AppInfo> {
        let mut apps = Vec::new();

        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let programdata = std::env::var("ProgramData").unwrap_or_default();
        let programfiles = std::env::var("ProgramFiles").unwrap_or_default();
        let programfiles_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();

        let mut start_menu_paths = Vec::new();
        if !appdata.is_empty() {
            start_menu_paths.push(format!("{}\\Microsoft\\Windows\\Start Menu", appdata));
        }
        if !programdata.is_empty() {
            start_menu_paths.push(format!("{}\\Microsoft\\Windows\\Start Menu", programdata));
        }

        let mut program_files_paths = Vec::new();
        if !programfiles.is_empty() {
            program_files_paths.push(programfiles);
        }
        if !programfiles_x86.is_empty() {
            program_files_paths.push(programfiles_x86);
        }

        for path in start_menu_paths {
            if Path::new(&path).exists() {
                for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
                    if entry.path().extension().and_then(|e| e.to_str()) == Some("lnk") {
                        let name = entry
                            .path()
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string();
                        let file_path = entry.path().to_string_lossy().to_string();
                        // Skip common junk executables
                        let skip_keywords = [
                            "uninstall",
                            "helper",
                            "updater",
                            "crash",
                            "reporter",
                            "setup",
                            "install",
                            "update",
                            "service",
                            "daemon",
                            "agent",
                            "notif",
                            "notify",
                            "elevate",
                            "x86",
                            "x64",
                        ];

                        let name_lower = name.to_lowercase();
                        if skip_keywords.iter().any(|k| name_lower.contains(k)) {
                            continue;
                        }
                        apps.push(AppInfo {
                            name,
                            path: file_path,
                            icon_path: None,
                        });
                    }
                }
            }
        }

        for path in program_files_paths {
            if Path::new(&path).exists() {
                for entry in WalkDir::new(path)
                    .max_depth(3)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.path().extension().and_then(|e| e.to_str()) == Some("exe") {
                        let name = entry
                            .path()
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        let name_lower = name.to_lowercase();
                        let skip_keywords = [
                            "uninstall",
                            "helper",
                            "updater",
                            "crash",
                            "reporter",
                            "setup",
                            "install",
                            "update",
                            "service",
                            "daemon",
                            "agent",
                            "notif",
                            "notify",
                            "elevate",
                        ];

                        if name.len() < 4 || skip_keywords.iter().any(|&k| name_lower.contains(k)) {
                            continue;
                        }

                        let file_path = entry.path().to_string_lossy().to_string();

                        apps.push(AppInfo {
                            name,
                            path: file_path,
                            icon_path: None,
                        });
                    }
                }
            }
        }

        apps
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let open_item =
                MenuItem::with_id(app, "open", "Open Setur", true, None::<&str>).unwrap();
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).unwrap();
            let tray_menu = Menu::with_items(app, &[&open_item, &quit_item]).unwrap();

            if let Some(tray) = app.tray_by_id("main-tray") {
                let _ = tray.set_menu(Some(tray_menu));
                let _ = tray.set_show_menu_on_left_click(false);
                tray.on_menu_event(|app: &tauri::AppHandle, event: tauri::menu::MenuEvent| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            } else {
                                let _ = tauri::WebviewWindowBuilder::new(
                                    app,
                                    "main",
                                    tauri::WebviewUrl::App("index.html".into()),
                                )
                                .title("setur")
                                .inner_size(800.0, 600.0)
                                .build();
                            }
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                });
                tray.on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event: TrayIconEvent| {
                    if let TrayIconEvent::Click { button, .. } = event {
                        if button == tauri::tray::MouseButton::Left {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            } else {
                                let _ = tauri::WebviewWindowBuilder::new(
                                    app,
                                    "main",
                                    tauri::WebviewUrl::App("index.html".into()),
                                )
                                .title("setur")
                                .inner_size(800.0, 600.0)
                                .build();
                            }
                        }
                    }
                });
            }

            #[cfg(target_os = "windows")]
            {
                let run_key = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
                    "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    KEY_READ | KEY_WRITE,
                );

                match run_key {
                    Ok(key) => {
                        let app_name = "Setur";
                        if key.get_value::<String, _>(app_name).is_err() {
                            if let Ok(exe_path) = std::env::current_exe() {
                                if let Err(e) =
                                    key.set_value(app_name, &exe_path.to_string_lossy().to_string())
                                {
                                    eprintln!("Failed to write autostart registry key: {}", e);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to open autostart registry key: {}", e);
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_presets,
            commands::save_preset,
            commands::delete_preset,
            commands::reorder_presets,
            commands::launch_preset,
            commands::is_first_launch,
            commands::get_installed_apps
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            tauri::RunEvent::WindowEvent { label, event, .. } => {
                if label == "main" {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        // Only quit if boot window is hidden or not visible
                        let boot_visible = app_handle
                            .get_webview_window("boot")
                            .and_then(|w| w.is_visible().ok())
                            .unwrap_or(false);

                        if !boot_visible {
                            std::process::exit(0);
                        }
                    }
                }
            }
            _ => {}
        })
}
