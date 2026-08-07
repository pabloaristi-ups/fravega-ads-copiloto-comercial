# Retail Media Intelligence V4.2.0 estable

Esta versión consolida el dashboard en una única implementación y un dataset maestro compartido.

## Correcciones

- Corte único YTD: enero hasta el último mes cerrado.
- Selección automática de la columna correcta de categoría en Campañas y GMV mediante solapamiento real de valores.
- Las tres solapas usan las mismas filas YTD de inversión y GMV.
- Se mantiene la exclusión 2025 de DESTINO DE FONDOS = AJUSTE o COOP.
- Se mantienen fuera de las visualizaciones las gerencias N/A y Sin categorizar.
- Timeout de 30 segundos: la pantalla ya no queda cargando indefinidamente.
- Controles de reconciliación disponibles en la consola del navegador.
- Tres solapas operativas: Dashboard Ejecutivo, Análisis por Categoría y Copiloto Comercial.
- Una sola fuente de código en `js/app-v4.js`; el bloque legado del HTML queda inactivo.
- Recomendaciones del Copiloto en grilla horizontal adaptable.
- Filtro de gerencia sincronizado entre recomendaciones y tabla, con limpieza funcional.
- Gráfico mensual de A/S Ratio 2026 por categoría, con vista comparativa Top 8 y selector para todas las categorías.

## Publicación en GitHub

Publicar como conjunto:

- `index.html`
- `js/app-v4.js`
- `css/dashboard.css`

Publicar los tres archivos juntos para evitar mezclar estructuras antiguas con la lógica V4.2.0.
