# Security

Do not open public issues containing tokens, SMTP passwords, personal files or your private network configuration. Use GitHub private vulnerability reporting when available; otherwise open a minimal issue requesting a private contact without disclosing exploit details.

This early release is intended for trusted administrators. Do not expose its HTTP port directly to the internet. Use a VPN or HTTPS reverse proxy, enable secure cookies for HTTPS and keep source mounts read-only. Never mount the Docker socket. The destination and restore directories are writable: restrict them to dedicated backup paths.

The source and destination marker files reduce accidental writes; they are not an adversarial security boundary. Check real mounts independently. Keep an offline or otherwise isolated backup and test recovery. No software can guarantee the safety of the only copy of your data.

Dependencies and base images need periodic review. Versioned releases do not silently update running installations.
