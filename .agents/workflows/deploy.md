---
description: Sube versión, reinicia PM2 y sube a GitHub con un solo comando.
---

Este flujo de trabajo automatiza el proceso de despliegue completo del proyecto Dashboard_Global.

1. **Incrementar Versión**: Actualiza la versión en package.json.
// turbo
```bash
node scripts/sync_version.js
```

2. **Reiniciar Servicio**: Reinicia el proceso PM2 con los nuevos cambios.
// turbo
```bash
npx.cmd pm2 restart dashboard-global
```

3. **Sincronizar GitHub**: Commit y push con la versión actual.
// turbo
```bash
node scripts/git_push.js "Actualización del Dashboard"
```

**Nota**: Puedes cambiar el resumen del cambio editando el argumento entre comillas en el paso 3.
