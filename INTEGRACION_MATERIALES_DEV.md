# Integración materiales PWA (DEV)

El tablero quedó preparado para consultar:

`https://dev.inventariosanmartin.com.ar/api/reporte-materiales-mensual?desde=2026-07`

Respuesta esperada (ejemplo):

```json
{
  "desde": "2026-07",
  "meses": [
    {
      "mes": "2026-07",
      "GU": { "materiales": 1320 },
      "RAN": { "materiales": 4580 },
      "MOU": { "materiales": 230 },
      "total": { "materiales": 6130 }
    }
  ]
}
```

También acepta `unidades` o `cantidad` en lugar de `materiales` dentro de cada bloque.

Los meses anteriores a 2026-07 muestran `—` para materiales.
Si el endpoint DEV no está disponible, los sitios siguen mostrándose normalmente y las columnas de materiales muestran `—`.

Antes de publicar, el endpoint debe existir primero en DEV y habilitar CORS para el origen del tablero.

## Sincronización de estado por sitio (DEV)

El tablero también consulta:

`https://dev.inventariosanmartin.com.ar/api/estado-control-sitios`

Regla conservadora:

- Si el sitio existe en la PWA, la PWA define el estado del tablero.
  - `EN_CURSO` => `PARCIAL`
  - `FINALIZADO` => `FINALIZADO`
- Si el sitio NO existe en la PWA, el tablero conserva su estado histórico actual sin modificarlo.

Formato recomendado:

```json
{
  "sitios": [
    { "sitio": "BS057", "estado": "EN_CURSO" },
    { "sitio": "CN838", "estado": "FINALIZADO" }
  ]
}
```

El frontend también acepta `status`, `estadoControl` o `estadoPwa` como nombre de campo.
Los sitios sincronizados desde PWA muestran el selector de estado bloqueado para evitar una edición manual que sería sobrescrita por la fuente de verdad.
