Retail Media Intelligence V2.8

Cómo usar:
1. Abrir index.html en el navegador.
2. El dashboard consume datos en vivo desde el Google Sheet compartido vía GViz/JSONP.
3. La actualización automática corre cada 6 horas.
4. El botón “Actualizar datos” fuerza una nueva lectura manual.

Estructura:
- index.html: estructura de la app y solapas.
- css/dashboard.css: estilos visuales.
- js/app.js: conexión, normalización, cálculos, gráficos y Copiloto Comercial.
- docs/MANUAL_COPILOTO_COMERCIAL.txt: guía de uso para equipo comercial.


## V2.2
Mejora de legibilidad del Copiloto Comercial: la tabla incorpora celdas tipo card para Acción recomendada, detalle expandible en modal, chips visuales y layout optimizado para lectura comercial.


## V2.4
- Ajuste de layout del Copiloto Comercial para que la columna Acción recomendada quede dentro del contenedor.
- Tabla tipo CRM con ancho completo y comportamiento responsive.
- La tarjeta de Acción recomendada completa ahora abre el modal de detalle.

## V2.6
- Corrige el cruce de categorías entre GMV e inversión usando una clave normalizada auxiliar sin reemplazar el nombre visible.
- Evita que una corrección para una categoría afecte el resto del listado.
- Agrega diagnóstico en consola: `window.copilotCategoryDiagnostics` para ver categorías con inversión RM pero sin GMV asociado.
- Ajusta anchos y wrapping de la tabla del Copiloto para evitar que la primera columna pise la segunda.

## V2.7
- Se quitaron los avatares/iniciales de la columna Categoría para ganar espacio horizontal.
- Se amplió la columna Acción recomendada.
- El Score ahora pondera con mayor peso la oportunidad potencial en pesos, no solo el potencial relativo por GMV/brecha.


## Cambios V2.8

- Se excluyen de las visualizaciones las gerencias `N/A` y `Sin categorizar`.
- El filtro de Gerencia solo muestra gerencias accionables.
- Los KPIs globales/mensuales permanecen completos para mantener consistencia con el total del Sheet.

## V2.9 — Depuración de inversión 2025

Para el año 2025 se excluyen de todos los cálculos los registros cuyo campo
`DESTINO DE FONDOS` comience con `AJUSTE` o `COOP`. La regla se ejecuta al procesar
la base de campañas y no afecta los datos 2026. La consola del navegador muestra
un control de filas y monto excluidos.

