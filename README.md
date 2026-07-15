# Retail Media Intelligence V3.3 estable

Esta versión vuelve a la última base estable y aplica una corrección acotada, sin los parches de V3.0–V3.2.

## Correcciones

- Corte único YTD: enero hasta el último mes cerrado.
- Selección automática de la columna correcta de categoría en Campañas y GMV mediante solapamiento real de valores.
- Las tres solapas usan las mismas filas YTD de inversión y GMV.
- Se mantiene la exclusión 2025 de DESTINO DE FONDOS = AJUSTE o COOP.
- Se mantienen fuera de las visualizaciones las gerencias N/A y Sin categorizar.
- Timeout de 30 segundos: la pantalla ya no queda cargando indefinidamente.
- Controles de reconciliación disponibles en la consola del navegador.

## Publicación en GitHub

Reemplazar únicamente:

- `js/app.js`

No es necesario reemplazar `index.html` ni `css/dashboard.css` si el sitio ya conserva la estructura correcta.
