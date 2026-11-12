fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Err(error) = app_lib::run_server_mode(&args) {
        eprintln!("server mode: {error}");
        std::process::exit(1);
    }
}
