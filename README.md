# App NVA · Nou Volei Alzira

App web (PWA) del club: entrenamientos, partidos, informes, calendario, Dirección NVA e Instagram (reels y stories).
Viene del repositorio `Entrenadores`. Los datos ya no se guardan en GitHub, sino en **Supabase**, y para usar la app hay que **iniciar sesión**.

## Cómo funciona

- `nva-supabase.js` se carga antes que el resto de la app y se encarga de:
  - la pantalla de login (email y contraseña), la invitación y la recuperación de contraseña;
  - el «puente» de datos: la app sigue pidiendo y guardando archivos con rutas como `registros/…json`, y el puente los lee y guarda en Supabase:
    - `.json` y `.txt` → tabla `archivos`;
    - PDF, imágenes, vídeos y música → Storage, bucket privado `privado`;
  - ocultar los menús a los que el rol del usuario no tiene acceso.
  - la entrada con **huella** (Android) o **Face ID / Touch ID** (iPhone): tras entrar con contraseña, la app ofrece activarla. Se crea una llave de acceso (WebAuthn) del propio móvil y, con su extensión PRF, la contraseña se guarda **cifrada** en ese navegador; solo se descifra tras comprobar la huella o la cara. Necesita Android con Chrome reciente o iOS 18 o posterior. Si el móvil no lo permite, la app lo dice y se puede usar el gestor de contraseñas del móvil.
- Los permisos los aplica la base de datos (RLS). Ver `supabase/migrations/`.

## Roles

| Rol | Qué puede hacer |
| --- | --- |
| Propietario | Todo. Invita usuarios, cambia roles y edita la tabla de permisos. |
| Administrador | Todo menos gestionar usuarios. Opciones del club en solo lectura. |
| Entrenador | Pasa lista y rellena partidos e informes **solo de sus equipos**. Ve el tablón, «Otros» y el calendario. |
| Solo lectura | Consulta el inicio, el tablón, «Otros» y el calendario. |

El propietario cambia todo esto desde **⚙️ Opciones › Usuarios y permisos**, donde puede poner para cada rol y cada menú: sin acceso, «Ver» o «Editar».

## Puesta en marcha

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta, uno a uno y por orden de nombre, todos los archivos de `supabase/migrations/`.
   No hay ninguna tarea que los aplique sola: cada migración nueva hay que ejecutarla a mano igual.
3. Pon tu email de propietario:
   ```sql
   update public.ajustes set valor = 'tu@email.com' where clave = 'email_propietario';
   ```
4. En **Authentication › Sign In / Providers**, desactiva *Allow new users to sign up*.
   En **Authentication › URL Configuration**, pon como *Site URL* la dirección donde está publicada la app.
5. En **Authentication › Users › Add user**, crea tu usuario con ese mismo email y una contraseña. Entrará como propietario.
6. Despliega las funciones (con la [CLI de Supabase](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase functions deploy invitar-usuario
   supabase functions deploy lanzar-tarea
   supabase functions deploy descargar-calendarios
   ```
7. Rellena `supabase-config.js` con la *Project URL* y la *anon key* (Project Settings › API).
   La *anon key* es pública. **No** pongas nunca la *service_role*.

Los demás usuarios se invitan desde el panel: les llega un email para elegir su contraseña.
Los equipos de cada entrenador no se eligen al invitar: son los que tenga en **Opciones › Entrenadores y equipos** (el usuario y el entrenador se enlazan por el nombre).

## Tareas automáticas (reels, stories, música y PDF de la federación)

Los workflows siguen en el repositorio privado `Registro_Entrenamientos` (allí no se ven los logs públicamente).
Cuando la app guarda un archivo de solicitud (`Reels/solicitud.json`, `Reels/solicitud_historia.json`, `Reels/publicar.json` o `Reels/musica/solicitud.json`), llama a la Edge Function `lanzar-tarea`. Esta comprueba que el usuario tiene permiso de escritura en ese menú y arranca el workflow. El workflow baja los datos de Supabase, hace su trabajo y sube el resultado.

Los PDF de la federación (botón «Actualizar automáticamente») no pasan por GitHub: los baja la Edge Function `descargar-calendarios` y los guarda en `Calendarios/`.

Configuración:

1. En Supabase (**Edge Functions › Secrets**, o `supabase secrets set`):
   - `GITHUB_TOKEN`: un token *fine-grained* de GitHub con permiso **Actions: Read and write** solo sobre `Registro_Entrenamientos`.
   - `TAREAS_REPO` (opcional): `NouVoleiAlzira/Registro_Entrenamientos`.
2. En GitHub, en `Registro_Entrenamientos` › Settings › Secrets and variables › Actions:
   - secretos `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IG_TOKEN`, `GH_SECRETS_PAT` (guarda el token renovado de Instagram) y `ANTHROPIC_API_KEY` (opcional).
