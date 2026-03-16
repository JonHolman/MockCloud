let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function debug(message: string): void {
  if (verbose) {
    process.stderr.write(`[DEBUG] ${message}\n`);
  }
}

export function info(message: string): void {
  process.stderr.write(`[INFO] ${message}\n`);
}
