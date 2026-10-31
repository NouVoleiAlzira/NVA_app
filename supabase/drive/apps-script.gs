// =====================================================================
//  NVA · PDFs en el Drive del club
//  Se pega en https://script.google.com con la cuenta de Google del club.
//  · PDFs Resultados: la función de Supabase «subir-drive» le manda cada PDF
//    y este script lo guarda en la carpeta CARPETA, visible para cualquiera
//    que tenga el enlace. Si el archivo ya existe, cambia su contenido y el
//    enlace sigue siendo el mismo.
//  · Fichas de Federación: la función «fichas-drive» las guarda en la
//    carpeta CARPETA_FICHAS (privada: solo la cuenta del club) y las lee
//    para que la app las muestre o descargue.
//  · Autorizaciones de Federación: igual que las fichas, en la carpeta
//    CARPETA_AUTORIZACIONES (privada: solo la cuenta del club).
//
//  1. Cambia CLAVE por una clave larga inventada (la misma que el secreto
//     DRIVE_SCRIPT_CLAVE de Supabase).
//  2. Implementar › Nueva implementación › Aplicación web
//     Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
//  3. Copia la URL que termina en /exec (secreto DRIVE_SCRIPT_URL).
//  Al cambiar el código: Implementar › Gestionar implementaciones › ✏️ ›
//  Versión: Nueva versión. Así la URL /exec no cambia.
//  Las carpetas se crean solas la primera vez; después se pueden mover a
//  cualquier sitio del Drive o cambiarles el nombre.
// =====================================================================
const CLAVE = "CAMBIA_ESTA_CLAVE";
const CARPETA = "NVA · Partidos y Resultados";
const CARPETA_FICHAS = "NVA · Fichas de Federación";
const CARPETA_AUTORIZACIONES = "NVA · Autorizaciones de Federación";
// «fichas-drive» exige la 2 para las fichas y la 3 para las autorizaciones,
// para no dejarlas nunca en la carpeta pública
const VERSION = 3;

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (CLAVE === "CAMBIA_ESTA_CLAVE" || p.clave !== CLAVE) return salida({ error: "Clave del Apps Script incorrecta" });
    if (p.accion === "version") return salida({ version: VERSION });
    // Fichas y autorizaciones: carpetas privadas. Lo demás: PDFs de resultados (públicos).
    const privada = p.carpeta === "fichas" || p.carpeta === "autorizaciones";
    const carpeta = p.carpeta === "fichas" ? carpetaClub("CARPETA_FICHAS_ID", CARPETA_FICHAS)
      : p.carpeta === "autorizaciones" ? carpetaClub("CARPETA_AUTORIZACIONES_ID", CARPETA_AUTORIZACIONES)
      : carpetaClub("CARPETA_ID", CARPETA);
    if (p.accion === "leer") return leer(p, carpeta);
    const blob = Utilities.newBlob(Utilities.base64Decode(p.pdf), "application/pdf", p.nombre);

    let archivo = null;
    if (p.id) {
      // Solo archivos de la carpeta del club: nunca se toca nada más del Drive.
      try { archivo = DriveApp.getFileById(p.id); if (archivo.isTrashed() || !estaEn(archivo, carpeta)) archivo = null; } catch (err) { archivo = null; }
    }
    if (!archivo) {
      const it = carpeta.getFilesByName(p.nombre);
      if (it.hasNext()) archivo = it.next();
    }

    if (archivo) {
      // Nuevo contenido en el mismo archivo: el enlace no cambia.
      const r = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files/" + archivo.getId() + "?uploadType=media", {
        method: "patch",
        contentType: "application/pdf",
        payload: blob.getBytes(),
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true,
      });
      if (r.getResponseCode() >= 300) return salida({ error: "Drive respondió " + r.getResponseCode() + ": " + r.getContentText().slice(0, 200) });
      if (archivo.getName() !== p.nombre) archivo.setName(p.nombre);
    } else {
      archivo = carpeta.createFile(blob);
    }
    // Las fichas y autorizaciones llevan datos de menores: no se comparten con nadie.
    if (!privada) archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return salida({ id: archivo.getId(), url: archivo.getUrl() });
  } catch (err) {
    return salida({ error: String((err && err.message) || err) });
  }
}

// Devuelve el PDF (en base64) de un archivo de la carpeta, por id o por nombre.
function leer(p, carpeta) {
  let archivo = null;
  if (p.id) {
    try { archivo = DriveApp.getFileById(p.id); if (archivo.isTrashed() || !estaEn(archivo, carpeta)) archivo = null; } catch (err) { archivo = null; }
  }
  if (!archivo && p.nombre) {
    const it = carpeta.getFilesByName(p.nombre);
    if (it.hasNext()) archivo = it.next();
  }
  if (!archivo) return salida({ error: "No está en el Drive del club" });
  return salida({ id: archivo.getId(), nombre: archivo.getName(), pdf: Utilities.base64Encode(archivo.getBlob().getBytes()) });
}

function estaEn(archivo, carpeta) {
  const padres = archivo.getParents();
  while (padres.hasNext()) if (padres.next().getId() === carpeta.getId()) return true;
  return false;
}

function carpetaClub(propiedad, nombre) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(propiedad);
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {}
  }
  const it = DriveApp.getFoldersByName(nombre);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(nombre);
  props.setProperty(propiedad, f.getId());
  return f;
}

// Ejecútala una vez desde el editor (▶ Ejecutar) para dar los permisos de Drive.
function autorizar() {
  carpetaClub("CARPETA_ID", CARPETA);
  carpetaClub("CARPETA_FICHAS_ID", CARPETA_FICHAS);
  carpetaClub("CARPETA_AUTORIZACIONES_ID", CARPETA_AUTORIZACIONES);
  UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
  });
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
