fn main() {
    // Só os comandos da ponte (PLANNING §6) viram permissões (allow-*); nada é liberado por padrão.
    let manifest = tauri_build::AppManifest::new().commands(&[
        "api_info",
        "set_close_to_tray",
        "set_tray_status",
        "open_browser",
        "set_global_shortcut",
        "notify",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("tauri-build falhou");
}
