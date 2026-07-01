Retail Media Intelligence V2

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
