// Casca desktop: janela, tray, close → esconder, sidecar da api/, instância única, atalho
// global, notificação nativa e abrir o browser do sistema. Nenhuma lógica de produto aqui
// (PLANNING §1): a web decide o quê e quando; o Rust só faz o que a webview não alcança.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Clone, Serialize, Deserialize)]
struct ApiInfo {
    port: u16,
    token: String,
}

struct Desktop {
    api: ApiInfo,
    child: Mutex<Option<CommandChild>>,
    close_to_tray: AtomicBool,
    /// None se a tray não pôde ser criada: aí fechar a janela sai de verdade.
    tray: Option<TrayIcon>,
}

#[tauri::command]
fn api_info(state: State<Desktop>) -> ApiInfo {
    state.api.clone()
}

#[tauri::command]
fn set_close_to_tray(value: bool, state: State<Desktop>) {
    state.close_to_tray.store(value, Ordering::Relaxed);
}

#[tauri::command]
fn set_tray_status(
    active_connections: u32,
    app: AppHandle,
    state: State<Desktop>,
) -> tauri::Result<()> {
    if let Some(tray) = &state.tray {
        tray.set_menu(Some(tray_menu(&app, active_connections)?))?;
    }
    Ok(())
}

/// Abre uma URL http(s) no browser do sistema (login OAuth). Nada além de http(s): a webview
/// não ganha o `shell`/`opener` inteiro (PLANNING §7).
#[tauri::command]
fn open_browser(url: String, app: AppHandle) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("só URLs http(s)".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Troca o atalho global de mostrar/esconder a janela. None (ou vazio) desliga. Atalho inválido
/// ou já tomado por outro app volta como erro para a web; o app segue sem atalho.
#[tauri::command]
fn set_global_shortcut(shortcut: Option<String>, app: AppHandle) -> Result<(), String> {
    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| e.to_string())?;
    match shortcut.as_deref().map(str::trim) {
        Some(keys) if !keys.is_empty() => manager.register(keys).map_err(|e| e.to_string()),
        _ => Ok(()),
    }
}

/// Notificação nativa, só com a janela escondida (na tray) ou minimizada. Devolve se mostrou.
#[tauri::command]
fn notify(title: String, body: String, app: AppHandle) -> bool {
    let hidden = app
        .get_webview_window("main")
        .is_some_and(|w| !w.is_visible().unwrap_or(true) || w.is_minimized().unwrap_or(false));
    hidden
        && app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .inspect_err(|e| eprintln!("notificação falhou: {e}"))
            .is_ok()
}

fn tray_menu(app: &AppHandle, active: u32) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(
        app,
        "open",
        "Abrir Patchbay",
        true,
        None::<&str>,
    )?)?;
    if active > 0 {
        let label = if active == 1 {
            "1 conexão ativa".to_string()
        } else {
            format!("{active} conexões ativas")
        };
        menu.append(&MenuItem::with_id(
            app,
            "status",
            label,
            false,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?)?;
    Ok(menu)
}

fn build_tray(app: &AppHandle) -> tauri::Result<TrayIcon> {
    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!(
            "../icons/tray/64x64.png"
        ))?)
        .tooltip("Patchbay")
        .menu(&tray_menu(app, 0)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Atalho global: esconde se a janela está à vista e focada; senão traz para frente. Sem tray,
/// minimiza em vez de esconder (escondida, não haveria como voltar além do próprio atalho).
fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let shown = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    if !(shown && window.is_focused().unwrap_or(false)) {
        return show_main(app);
    }
    let has_tray = app.try_state::<Desktop>().is_some_and(|s| s.tray.is_some());
    let _ = if has_tray {
        window.hide()
    } else {
        window.minimize()
    };
}

/// Sobe a api/ e espera a linha `{"port","token"}` no stdout.
/// O stdin fica aberto enquanto o app vive; quando o app morre, a api sai sozinha.
fn spawn_api(app: &AppHandle) -> Result<(ApiInfo, CommandChild), Box<dyn std::error::Error>> {
    let shell = app.shell();
    let command = if cfg!(debug_assertions) {
        shell
            .command("npx")
            .args(["tsx", "api/src/server.ts"])
            .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/.."))
            .env("PATCHBAY_DEV_ORIGIN", "http://localhost:5173")
    } else {
        shell.sidecar("patchbay-api")?
    };
    let (mut events, child) = command.spawn()?;

    let info = tauri::async_runtime::block_on(async {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => return Ok(serde_json::from_slice::<ApiInfo>(&line)?),
                CommandEvent::Stderr(line) => eprint!("{}", String::from_utf8_lossy(&line)),
                CommandEvent::Terminated(status) => {
                    return Err(format!("api saiu antes do handshake: {:?}", status.code).into())
                }
                _ => {}
            }
        }
        Err::<ApiInfo, Box<dyn std::error::Error>>("api fechou sem handshake".into())
    })?;

    // Continua repassando o stderr da api para o terminal.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if let CommandEvent::Stderr(line) = event {
                eprint!("{}", String::from_utf8_lossy(&line));
            }
        }
    });
    Ok((info, child))
}

fn main() {
    tauri::Builder::default()
        // Precisa ser o primeiro plugin: abrir de novo só foca a janela existente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app)
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // O atalho em si vem da web (Configurações) via set_global_shortcut.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let (api, child) = spawn_api(app.handle())?;
            let tray = build_tray(app.handle())
                .inspect_err(|e| eprintln!("tray indisponível, fechar vai sair: {e}"))
                .ok();
            app.manage(Desktop {
                api,
                child: Mutex::new(Some(child)),
                close_to_tray: AtomicBool::new(true),
                tray,
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<Desktop>();
                if state.tray.is_some() && state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            api_info,
            set_close_to_tray,
            set_tray_status,
            open_browser,
            set_global_shortcut,
            notify
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Patchbay")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Desktop>() {
                    if let Some(child) = state.child.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
