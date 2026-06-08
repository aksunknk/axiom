use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

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
        if api_is_healthy() {
            log::info!("backend already running on port 8000");
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
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("backend");
        if bundled.join("main.py").exists() {
            return Ok(bundled);
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend");
    if dev.join("main.py").exists() {
        return dev
            .canonicalize()
            .map_err(|e| e.to_string());
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

fn api_is_healthy() -> bool {
    // ポート8000が使用中なら既存APIを再利用する。
    TcpListener::bind("127.0.0.1:8000").is_err()
}
