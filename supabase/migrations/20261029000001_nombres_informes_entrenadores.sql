-- =====================================================================
-- «Informes PDF» pasa a llamarse «Informes Entrenadores», y el botón
-- «Reporte Kilometraje» se muestra dentro de esa subsección (ya no tiene
-- título propio). Su permiso sigue siendo independiente (informes.kilometraje),
-- así que en «Permisos por rol» queda justo debajo, con el nombre del botón.
-- =====================================================================
update public.menus set nombre = 'Informes Entrenadores' where id = 'informes.pdf';
update public.menus set nombre = 'Reporte Kilometraje', orden = 23 where id = 'informes.kilometraje';
update public.menus set orden = 24 where id = 'informes.fichas';
update public.menus set orden = 25 where id = 'informes.drive';
