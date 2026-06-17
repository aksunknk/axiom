use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

const BACKEND_PORT: u16 = 8000;
const MAX_START_ATTEMPTS: u32 = 5;
const PORT_FREE_POLL: Duration = Duration::from_millis(50);
const PORT_FREE_TIMEOUT: Duration = Duration::from_secs(5);
const HEALTH_POLL: Duration = Duration::from_millis(200);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(30);
const RETRY_DELAY: Duration = Duration::from_millis(500);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct BackendServer {
    child: Mutex<Option<Child>>,
}

impl BackendServer {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn start(app: &AppHandle) {
        if http_health_ok() {
            log::info!("backend API healthy on port {BACKEND_PORT}, reusing");
            return;
        }

        let backend_dir = match resolve_backend_dir(app) {
            Ok(dir) => dir,
            Err(err) => {
                log::error!("backend dir not found: {err}");
                return;
            }
        };

        let python = resolve_python(&backend_dir);

        for attempt in 1..=MAX_START_ATTEMPTS {
            if http_health_ok() {
                log::info!("backend API became healthy before attempt {attempt}");
                return;
            }

            clear_stale_listeners(BACKEND_PORT);

            log::info!(
                "starting backend (attempt {attempt}/{MAX_START_ATTEMPTS}): {} -m uvicorn main:app (cwd={})",
                python.display(),
                backend_dir.display()
            );

            let mut child = match spawn_backend(&python, &backend_dir) {
                Ok(process) => process,
                Err(err) => {
                    log::error!("failed to spawn backend on attempt {attempt}: {err}");
                    thread::sleep(RETRY_DELAY);
                    continue;
                }
            };

            if wait_for_child_health(&mut child, HEALTH_TIMEOUT) {
                if let Some(server) = app.try_state::<BackendServer>() {
                    *server.child.lock().unwrap() = Some(child);
                }
                log::info!("backend process ready on port {BACKEND_PORT}");
                return;
            }

            log::warn!(
                "backend did not become healthy on attempt {attempt}/{MAX_START_ATTEMPTS}"
            );
            let _ = child.kill();
            let _ = child.wait();
            thread::sleep(RETRY_DELAY);
        }

        log::error!("backend failed to start after {MAX_START_ATTEMPTS} attempts");
    }

    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("backend process stopped");
        }
    }
}
fn spawn_backend(python: &Path, backend_dir: &Path) -> Result<Child, std::io::Error> {
    let mut cmd = Command::new(python);
    cmd.args([
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        "127.0.0.1",
        "--port",
        &BACKEND_PORT.to_string(),
    ])
    .current_dir(backend_dir)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    configure_hidden(&mut cmd);
    cmd.spawn()
}

fn resolve_backend_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // dev ビルドはワークスペース backend を優先（HMR と同期、不完全な resources スタブを避ける）
    #[cfg(debug_assertions)]
    {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend");
        if dev.join("main.py").exists() {
            return dev.canonicalize().map_err(|e| e.to_string());
        }
    }

    // NSIS/MSI は exe と同階層の backend/ に展開する
    if let Ok(exe_dir) = app.path().executable_dir() {
        let bundled = exe_dir.join("backend");
        if bundled.join("main.py").exists() {
            log::info!("using bundled backend at {}", bundled.display());
            return Ok(bundled);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("backend");
        if bundled.join("main.py").exists() {
            log::info!("using resource backend at {}", bundled.display());
            return Ok(bundled);
        }
    }

    #[cfg(debug_assertions)]
    {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend");
        if dev.join("main.py").exists() {
            return dev.canonicalize().map_err(|e| e.to_string());
        }
    }

    Err("backend/main.py not found".into())
}

fn resolve_python(backend_dir: &Path) -> PathBuf {
    let venv_py = backend_dir.join(".venv/Scripts/python.exe");
    if venv_py.exists() {
        return venv_py;
    }
    PathBuf::from("python")
}

/// GET /api/health が 200 + {"status":"ok"} を返すか。
fn http_health_ok() -> bool {
    let addr: SocketAddr = format!("127.0.0.1:{BACKEND_PORT}")
        .parse()
        .expect("valid addr");
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(800)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));

    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{BACKEND_PORT}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut buf = [0u8; 512];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    let response = String::from_utf8_lossy(&buf[..n]);
    response.contains("200") && response.contains("\"status\":\"ok\"")
}

fn wait_for_child_health(child: &mut Child, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            log::error!("backend exited before becoming healthy: {status}");
            return false;
        }
        if http_health_ok() {
            return true;
        }
        thread::sleep(HEALTH_POLL);
    }

    if let Ok(Some(status)) = child.try_wait() {
        log::error!("backend exited before becoming healthy: {status}");
        return false;
    }

    http_health_ok()
}

fn is_port_bindable(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn wait_for_port_free(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if is_port_bindable(port) {
            return true;
        }
        thread::sleep(PORT_FREE_POLL);
    }
    is_port_bindable(port)
}

/// ヘルス未応答かつポート占有時のみ、リスナーのプロセスを終了する。
fn clear_stale_listeners(port: u16) {
    if http_health_ok() {
        return;
    }

    if is_port_bindable(port) {
        return;
    }

    let own_pid = std::process::id();
    for pid in listener_pids_on_port(port) {
        if pid == own_pid {
            continue;
        }
        if kill_process(pid) {
            log::info!("stopped stale listener pid={pid} on port {port}");
        }
    }

    if !wait_for_port_free(port, PORT_FREE_TIMEOUT) {
        log::warn!("port {port} is still occupied after clearing listeners");
    }
}

fn listener_pids_on_port(port: u16) -> Vec<u32> {
    #[cfg(windows)]
    {
        listener_pids_windows(port)
    }
    #[cfg(not(windows))]
    {
        listener_pids_unix(port)
    }
}

#[cfg(windows)]
fn listener_pids_windows(port: u16) -> Vec<u32> {
    let mut cmd = Command::new("netstat");
    cmd.args(["-ano", "-p", "tcp"]);
    configure_hidden(&mut cmd);
    cmd.stdout(Stdio::piped()).stderr(Stdio::null());

    let output = match cmd.output() {
        Ok(output) if output.status.success() => output,
        Ok(output) => {
            log::warn!(
                "netstat exited with {} while probing port {port}",
                output.status
            );
            return Vec::new();
        }
        Err(err) => {
            log::warn!("netstat failed while probing port {port}: {err}");
            return Vec::new();
        }
    };

    parse_listener_pids(&String::from_utf8_lossy(&output.stdout), port)
}

#[cfg(not(windows))]
fn listener_pids_unix(port: u16) -> Vec<u32> {
    let mut cmd = Command::new("lsof");
    cmd.args(["-ti", &format!("tcp:{port}")]);
    configure_hidden(&mut cmd);
    cmd.stdout(Stdio::piped()).stderr(Stdio::null());

    let output = match cmd.output() {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect()
}

fn parse_listener_pids(netstat_output: &str, port: u16) -> Vec<u32> {
    let port_token = format!(":{port}");
    let mut pids = Vec::new();

    for line in netstat_output.lines() {
        if !line.contains("LISTENING") {
            continue;
        }

        let Some(local_addr) = line.split_whitespace().nth(1) else {
            continue;
        };
        if !local_addr.ends_with(&port_token) {
            continue;
        }

        let Some(pid) = line.split_whitespace().last().and_then(|s| s.parse().ok()) else {
            continue;
        };
        if pid != 0 && !pids.contains(&pid) {
            pids.push(pid);
        }
    }

    pids
}

fn kill_process(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/F", "/PID", &pid.to_string()]);
        configure_hidden(&mut cmd);
        cmd.stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("kill");
        cmd.args(["-9", &pid.to_string()]);
        configure_hidden(&mut cmd);
        cmd.stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

#[cfg(windows)]
fn configure_hidden(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(windows))]
fn configure_hidden(cmd: &mut Command) -> &mut Command {
    cmd
}
