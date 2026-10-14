fn main() {
    // Só os três comandos do PLANNING §6 viram permissões (allow-*); nada é liberado por padrão.
    let manifest = tauri_build::AppManifest::new().commands(&[
        "api_info",
        "set_close_to_tray",
        "set_tray_status",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("tauri-build falhou");
}
