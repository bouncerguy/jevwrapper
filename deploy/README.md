# Small-server deployment

1. Copy this repository to `/opt/jevwrapper`, owned by the administrator and readable by the service.
2. Install Node 22+ from an official source. Adjust `ExecStart` if your Node binary is not `/usr/local/bin/node`.
3. Copy `.env.example` to `/etc/jevwrapper.env`. Set both provider keys and a random owner token of at least 24 characters. Set mode 600 on that file. Never put it in a public document root.
4. Install `jevwrapper.service` to `/etc/systemd/system/`, run `systemctl daemon-reload`, then `systemctl enable --now jevwrapper`.
5. Back up your existing Nginx file. Add the two locations from `nginx.conf.example` only inside the intended domain's TLS server block. Run `nginx -t` before reloading Nginx.
6. Verify the HTTPS page, `/jevwrapper/api/config`, a live authenticated example, and rejection of unauthenticated POSTs. Use synthetic, non-sensitive text for the live test.

The app listens on localhost by default. DynamicUser and the service sandbox keep it separate from other applications. No npm install is needed.

For updates, keep a copy of the previous release, replace app files without touching the environment file, run tests, restart only the JEV Wrapper service, and verify the public route. Restore the previous release and restart if verification fails.
