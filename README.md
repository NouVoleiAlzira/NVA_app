# App NVA · Nou Volei Alzira

App web (PWA) del club: entrenamientos, partidos, informes, calendario, Dirección NVA, carteles e Instagram.
Viene del repositorio `Entrenadores`. Los datos ya no se guardan en GitHub, sino en **Supabase**, y para usar la app hay que **iniciar sesión**.

## Cómo funciona

- `nva-supabase.js` se carga antes que el resto de la app y se encarga de:
  - la pantalla de login (email y contraseña), la invitación y la recuperación de contraseña;
  - el «puente» de datos: la app sigue pidiendo y guardando archivos con rutas como `registros/…json`, y el puente los lee y guarda en Supabase:
    - `.json` y `.txt` → tabla `archivos`;
    - PDF, imágenes, vídeos y música → Storage, bucket privado `privado`;
  - ocultar los menús a los que el rol del usuario no tiene acceso.
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
2. En **SQL Editor**, pega y ejecuta, por orden, los archivos de `supabase/migrations/` (`20261024000001_esquema_inicial.sql` y después `20261024000002_alta_solo_por_invitacion.sql`).
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
   ```
7. Rellena `supabase-config.js` con la *Project URL* y la *anon key* (Project Settings › API).
   La *anon key* es pública. **No** pongas nunca la *service_role*.

Los demás usuarios se invitan desde el panel: les llega un email para elegir su contraseña.

## Tareas automáticas (reels, stories, música y PDF de la federación)

Los workflows siguen en el repositorio privado `Registro_Entrenamientos` (allí no se ven los logs públicamente).
Cuando la app guarda un archivo de solicitud (`Reels/solicitud.json`, `Calendarios/solicitud.json`…), llama a la Edge Function `lanzar-tarea`. Esta comprueba que el usuario tiene permiso de escritura en ese menú y arranca el workflow. El workflow baja los datos de Supabase, hace su trabajo y sube el resultado.

Configuración:

1. En Supabase (**Edge Functions › Secrets**, o `supabase secrets set`):
   - `GITHUB_TOKEN`: un token *fine-grained* de GitHub con permiso **Actions: Read and write** solo sobre `Registro_Entrenamientos`.
   - `TAREAS_REPO` (opcional): `NouVoleiAlzira/Registro_Entrenamientos`.
2. En GitHub, en `Registro_Entrenamientos` › Settings › Secrets and variables › Actions:
   - secretos `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`;
   - cuando los datos ya estén migrados, la variable `DATOS_EN_SUPABASE` = `si`, para que las tareas programadas (reels de los lunes y martes, PDF diarios) también usen Supabase.

## Traspaso de los datos existentes

```bash
git clone https://github.com/NouVoleiAlzira/Registro_Entrenamientos
SUPABASE_URL=https://avsovxrohruariydaned.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/migrar-datos.mjs ./Registro_Entrenamientos
```

Se puede repetir sin problema: sobrescribe por ruta.
