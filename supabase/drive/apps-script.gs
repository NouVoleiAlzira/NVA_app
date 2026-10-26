// =====================================================================
//  NVA · PDFs Resultados en Drive
//  Se pega en https://script.google.com con la cuenta de Google del club.
//  La función de Supabase «subir-drive» le manda cada PDF y este script lo
//  guarda en la carpeta CARPETA del Drive del club, visible para cualquiera
//  que tenga el enlace. Si el archivo ya existe, cambia su contenido y el
//  enlace sigue siendo el mismo.
//
//  1. Cambia CLAVE por una clave larga inventada (la misma que el secreto
//     DRIVE_SCRIPT_CLAVE de Supabase).
//  2. Implementar › Nueva implementación › Aplicación web
//     Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
//  3. Copia la URL que termina en /exec (secreto DRIVE_SCRIPT_URL).
//  La carpeta se crea sola la primera vez; después se puede mover a
//  cualquier sitio del Drive o cambiarle el nombre.
// =====================================================================
const CLAVE = "CAMBIA_ESTA_CLAVE";
const CARPETA = "NVA · Partidos y Resultados";

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (CLAVE === "CAMBIA_ESTA_CLAVE" || p.clave !== CLAVE) return salida({ error: "Clave del Apps Script incorrecta" });
    const blob = Utilities.newBlob(Utilities.base64Decode(p.pdf), "application/pdf", p.nombre);
    const carpeta = carpetaClub();

    let archivo = null;
    if (p.id) {
      try { archivo = DriveApp.getFileById(p.id); if (archivo.isTrashed()) archivo = null; } catch (err) { archivo = null; }
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
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return salida({ id: archivo.getId(), url: archivo.getUrl() });
  } catch (err) {
    return salida({ error: String((err && err.message) || err) });
  }
}

function carpetaClub() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("CARPETA_ID");
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {}
  }
  const it = DriveApp.getFoldersByName(CARPETA);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA);
  props.setProperty("CARPETA_ID", f.getId());
  return f;
}

// Ejecútala una vez desde el editor (▶ Ejecutar) para dar los permisos de Drive.
function autorizar() {
  carpetaClub();
  UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
  });
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
