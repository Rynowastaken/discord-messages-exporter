use std::env;
use std::fs;
use std::net::{IpAddr, TcpListener, TcpStream, UdpSocket};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const PRODUCT_DIR: &str = "Discord Messages Exporter";

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

fn locate_app_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(custom) = env::var("DISCORD_MESSAGES_EXPORTER_APP_DIR") {
        candidates.push(PathBuf::from(custom));
    }
    if let Ok(executable) = env::current_exe() {
        if let Some(dir) = executable.parent() {
            candidates.push(dir.join("app"));
            candidates.push(dir.join("resources").join("app"));
            candidates.push(dir.join("..").join("lib").join(PRODUCT_DIR).join("app"));
            candidates.push(dir.join("..").join("Resources").join("app"));
        }
    }
    candidates.into_iter().find(|dir| {
        dir.join("server.cjs").is_file()
            && (dir.join("node").is_file() || dir.join("node.exe").is_file())
    })
}

fn app_dir_for(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Some(dir) = locate_app_dir() {
        return Ok(dir);
    }
    Ok(app.path().resource_dir()?.join("app"))
}

fn local_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let address = socket.local_addr().ok()?;
    Some(address.ip())
}

fn data_root() -> PathBuf {
    if let Ok(custom) = env::var("DISCORD_MESSAGES_EXPORTER_DATA") {
        return PathBuf::from(custom);
    }
    if cfg!(windows) {
        if let Ok(appdata) = env::var("APPDATA") {
            return PathBuf::from(appdata).join("discord-messages-exporter");
        }
    }
    if cfg!(target_os = "macos") {
        if let Ok(home) = env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("discord-messages-exporter");
        }
    }
    if let Ok(xdg) = env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg).join("discord-messages-exporter");
    }
    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("discord-messages-exporter");
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn option_value(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|arg| arg == name)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

pub fn run_server_mode(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = locate_app_dir().ok_or(
        "could not find the bundled server resources next to the executable; set DISCORD_MESSAGES_EXPORTER_APP_DIR",
    )?;
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let node = app_dir.join(node_name);
    let server = app_dir.join("server.cjs");
    let host = option_value(args, "--host").unwrap_or_else(|| "0.0.0.0".to_string());
    let port = option_value(args, "--port").unwrap_or_else(|| "8788".to_string());
    let data = option_value(args, "--data")
        .map(PathBuf::from)
        .unwrap_or_else(data_root);
    let runs = data.join("runs");
    let exports = data.join("exports");
    fs::create_dir_all(&runs)?;
    fs::create_dir_all(&exports)?;

    let mut child = Command::new(&node)
        .arg(&server)
        .arg("--host")
        .arg(&host)
        .arg("--port")
        .arg(&port)
        .env("DISCORD_MESSAGES_EXPORTER_MAIN", "1")
        .env("DISCORD_MESSAGES_EXPORTER_PARENT_PID", std::process::id().to_string())
        .env("DISCORD_MESSAGES_EXPORTER_DIST", app_dir.join("web-dist"))
        .env("DISCORD_MESSAGES_EXPORTER_RUNS", &runs)
        .env("DISCORD_MESSAGES_EXPORTER_EXPORTS", &exports)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()?;

    let local = format!("http://127.0.0.1:{port}");
    let network = local_ip()
        .filter(|ip| !ip.is_loopback())
        .map(|ip| format!("http://{ip}:{port}"));
    let mut summary = format!("Discord Messages Exporter server\n  local:   {local}\n");
    if let Some(url) = &network {
        summary.push_str(&format!("  network: {url}\n"));
    }
    summary.push_str(&format!("  data:    {}\n", data.display()));
    print!("{summary}");
    let _ = fs::write(data.join("server-url.txt"), &summary);
    println!("Press Ctrl-C to stop.");

    loop {
        std::thread::sleep(Duration::from_secs(1));
        if let Some(status) = child.try_wait()? {
            return if status.success() {
                Ok(())
            } else {
                Err(format!("server exited with {status}").into())
            };
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--server") {
        if let Err(err) = run_server_mode(&args) {
            eprintln!("server mode: {err}");
            std::process::exit(1);
        }
        return;
    }

    #[cfg(target_os = "linux")]
    env::set_var("GTK_THEME", "Adwaita:dark");

    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app_dir_for(app.handle())?;
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
            .theme(Some(tauri::Theme::Dark))
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
