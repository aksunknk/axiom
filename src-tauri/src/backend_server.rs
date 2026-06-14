use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};

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
            log::info!("backend API healthy on port 8000, reusing");
            return;
        }

        // ポート占有のみで古い uvicorn が残っている場合は停止してから再起動する。
        kill_listeners_on_port(8000);

        let backend_dir = match resolve_backend_dir(app) {
            Ok(dir) => dir,
            Err(err) => {
                log::error!("backend dir not found: {err}");
                return;
            }
        };

        let python = resolve_python(&backend_dir);
        log::info!(
            "starting backend: {} -m uvicorn main:app (cwd={})",
            python.display(),
            backend_dir.display()
        );

        let child = Command::new(&python)
            .args([
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ])
            .current_dir(&backend_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        match child {
            Ok(process) => {
                if let Some(server) = app.try_state::<BackendServer>() {
                    *server.child.lock().unwrap() = Some(process);
                }
                log::info!("backend process started");
            }
            Err(err) => log::error!("failed to start backend: {err}"),
        }
    }

    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("backend process stopped");
        }
    }
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

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("backend");
        if bundled.join("main.py").exists() {
            return Ok(bundled);
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend");
    if dev.join("main.py").exists() {
        return dev.canonicalize().map_err(|e| e.to_string());
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
    let addr: SocketAddr = "127.0.0.1:8000".parse().expect("valid addr");
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(800)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));

    let request =
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:8000\r\nConnection: close\r\n\r\n";
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

/// Windows: ポート8000の LISTEN プロセスを強制終了。
fn kill_listeners_on_port(port: u16) {
    let script = format!(
        "Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"
    );
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}
