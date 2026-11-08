# Shared deployment registry

This project can publish and deploy through `registry.parscryptoexchange.com:5443`.
Images live under `<registry>/<GitHub owner>/<repository>:<tag>`; the miniapp
uses additional `/server` and `/web` image paths. All projects share the same
registry service and persistent storage, with separate image repositories.

In each GitHub repository, configure Actions variable `LOCAL_REGISTRY` as
`registry.parscryptoexchange.com:5443` and Actions secrets `LOCAL_REG_USER` and
`LOCAL_REG_PASS`. Make them visible to both CI and the production environment.
The root-only source of credentials is `/opt/marketbot-registry/credentials.json`
on the server. Never put the password in source code or workflow variables.

Merge the workflow changes and run CI on main to publish images before deploying.
Existing tags are not automatically copied between registries. CI keeps publishing
to GHCR as well. Removing `LOCAL_REGISTRY` returns deployment to GHCR plus SSH
image transfer. Production deploys remain manual, with existing health checks.

A single registry can also hold the bot, engine and other projects. Apply the
same login, image naming, CI publishing, and explicit server pull pattern in
those source repositories. The registry does not automatically mirror upstream
registries or Docker Hub images. Keep registry DNS in DNS-only mode in Cloudflare.
