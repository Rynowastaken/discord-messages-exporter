use std::fs;
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct ServerProcess(Mutex<Option<Child>>);

fn free_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

fn wait_for_server(port: u16) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(120));
    }
}

fn resource_app_dir(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    Ok(app.path().resource_dir()?.join("app"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = resource_app_dir(app.handle())?;
            let node_name = if cfg!(windows) { "node.exe" } else { "node" };
            let node = app_dir.join(node_name);
            let server = app_dir.join("server.cjs");
            let web_dist = app_dir.join("web-dist");
            let data_dir = app.path().app_data_dir()?;
            let runs = data_dir.join("runs");
            let exports = data_dir.join("exports");
            fs::create_dir_all(&runs)?;
            fs::create_dir_all(&exports)?;
            fs::create_dir_all(&web_dist)?;

            let port = free_port()?;
            let child = Command::new(&node)
                .arg(&server)
                .arg("--host")
                .arg("127.0.0.1")
                .arg("--port")
                .arg(port.to_string())
                .env("DISCORD_MESSAGES_EXPORTER_MAIN", "1")
                .env(
                    "DISCORD_MESSAGES_EXPORTER_PARENT_PID",
                    std::process::id().to_string(),
                )
                .env("DISCORD_MESSAGES_EXPORTER_DIST", &web_dist)
                .env("DISCORD_MESSAGES_EXPORTER_RUNS", &runs)
                .env("DISCORD_MESSAGES_EXPORTER_EXPORTS", &exports)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()?;
            app.manage(ServerProcess(Mutex::new(Some(child))));
            wait_for_server(port);

            let url = format!("http://127.0.0.1:{port}");
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse()?),
            )
            .title("Discord Messages Exporter")
            .inner_size(1440.0, 900.0)
            .min_inner_size(900.0, 600.0)
            .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the desktop application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
