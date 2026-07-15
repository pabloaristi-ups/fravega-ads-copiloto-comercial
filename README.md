# Retail Media Intelligence V3

## Cambio estructural
Las tres solapas consumen un único **dataset maestro YTD**, con corte automático al último mes cerrado.

- Dashboard Ejecutivo: YTD.
- Análisis por Categoría: YTD.
- Copiloto Comercial: YTD.
- A/S Ratio: inversión RM YTD / GMV YTD.
- Se mantiene la exclusión 2025 de `DESTINO DE FONDOS` que comience con `AJUSTE` o `COOP`.
- Se excluyen de visualización gerencias `N/A` y `Sin categorizar`.

## Actualización en GitHub
Reemplazar únicamente:

`js/app.js`

Opcional: reemplazar `README.md`.

Luego esperar el deploy de GitHub Pages y hacer recarga fuerte (Cmd+Shift+R / Ctrl+F5).
