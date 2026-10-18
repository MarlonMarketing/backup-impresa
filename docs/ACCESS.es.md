# Personas, secretos y permisos

El administrador actual sigue como Owner. La instalación no cambia claves/contraseñas anteriores.

1. **Accesos y permisos → Catálogo**: copia ID exactos permitidos.
2. **Invitar**: nombre, rol, un ID por línea. Vacío significa ninguno; `*` incluye todos, incluso futuros. Evítalo para clientes.
3. Guarda el token mostrado una vez; envíalo privado. Caduca en 48 horas y se puede revocar antes de usarlo.
4. Destinatario: login → **Aceptar invitación**, token, usuario/contraseña de al menos 12 caracteres. Un uso; después inicia sesión normalmente.
5. Verifica aislamiento, cambia rol/recursos o desactiva la persona: sesión rechazada desde la siguiente petición.

| Rol | Acciones sobre recursos asignados |
|---|---|
| viewer | Lee nombres/resultados; no explora archivos, recupera ni ejecuta. |
| operator | Lee y ejecuta operaciones permitidas; no recupera. |
| proposer | Lee y propone planes desactivados con ubicaciones permitidas; no aprueba. |
| maintainer | Lee/ejecuta/recupera y configura horarios de planes conectados existentes asignados. No conexiones/usuarios/tokens ni cambios origen/destino. |
| owner | Administra todo, incluidas credenciales, accesos y aprobaciones. |

ID: `legacy:PLAN` copias locales anteriores, `control:PLAN` SSH/Restic existentes, `transport:PLAN` conectores nuevos. Propuestas necesitan `location:ORIGEN` y `location:DESTINO`. Validación en servidor incluso ante peticiones manipuladas. Explorar archivos requiere restore, no solo read.

## Tokens

Página API/MCP → **Crear token**: canal API/MCP/ambos, 1–365 días, recursos exactos, acciones mínimas. Solo se muestra una vez; se almacena huella SHA-256. Rotar: crear otro y revocar anterior. Identidades independientes: desactivar persona no revoca otros tokens; revisar aparte. Límite 60 peticiones/token/minuto. Nunca tokens en URL o Git.

Caja fuerte AES-256-GCM con clave maestra separada. Administrador del host con ambos archivos puede descifrar: no es HSM. Campos secretos vacíos conservan valores. Desactiva horarios dependientes antes de cambiar identidad de conexión. Renovaciones OAuth cifradas. API/MCP no leen secretos ni ejecutan shell arbitraria. Auditoría local: 3.000 acciones/decisiones recientes, 200 en panel; no registro de cumplimiento inmutable.

Propietario revisa propuesta exacta, verifica huella/caducidad y aprueba desactivada. Para archivo protegido aporta contraseña. Prueba copia/verificación/recuperación antes de programar. Agentes no pueden aprobar.

Software **self-hosted con propietario y recursos delegados**, no aislamiento SaaS multi-tenant. Implementa/prueba la arquitectura separada antes de alojar clientes independientes juntos.
