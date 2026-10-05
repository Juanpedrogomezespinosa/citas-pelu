# Plantillas de WhatsApp para aprobación

WhatsApp solo permite que el **negocio inicie** una conversación (o escriba pasadas 24 h desde el último mensaje del cliente) con **plantillas aprobadas**. La app envía cuatro mensajes de este tipo; las respuestas automáticas a lo que escribe el cliente no necesitan plantilla.

| Clave | Cuándo se envía | Variable de entorno (Twilio) | Variable de entorno (Meta) |
|---|---|---|---|
| `confirmacion` | Al reservar una cita | `TWILIO_CONTENT_SID_CONFIRMACION` | `META_TEMPLATE_CONFIRMACION` |
| `recordatorio` | `REMINDER_HOURS_BEFORE` horas antes, o desde el botón "Recordar" | `TWILIO_CONTENT_SID_RECORDATORIO` | `META_TEMPLATE_RECORDATORIO` |
| `cambio` | Al reprogramar (día, hora o profesional) | `TWILIO_CONTENT_SID_CAMBIO` | `META_TEMPLATE_CAMBIO` |
| `cancelacion` | Al cancelar desde el panel | `TWILIO_CONTENT_SID_CANCELACION` | `META_TEMPLATE_CANCELACION` |

Mientras falte una plantilla, ese mensaje sale como texto libre. Eso funciona en el sandbox de Twilio y dentro de la ventana de 24 h, pero **en producción el proveedor lo rechazará**. Al arrancar en producción, la API avisa de las plantillas que faltan.

## Datos comunes al darlas de alta

- **Categoría:** `UTILITY` (utilidad: avisos sobre un servicio contratado; no es marketing).
- **Idioma:** español (`es`). Si usas otra variante, ajusta `META_TEMPLATE_LANGUAGE`.
- **Nombre** (Meta) o **friendly name** (Twilio): por ejemplo `cita_confirmacion`, `cita_recordatorio`, `cita_cambio` y `cita_cancelacion`.
- Sustituye **«Tu Peluquería»** por el nombre real del salón (el mismo que `BUSINESS_NAME`).
- Las variables `{{n}}` las rellena la app en este orden. No cambies su número ni su orden sin cambiar también `src/services/whatsapp/mensajes.ts`.

Los textos coinciden con los de texto libre de `mensajes.ts`: el cliente recibe lo mismo en ambos casos. Si cambias uno, cambia el otro y vuelve a enviar la plantilla a aprobación.

---

### 1. `confirmacion`

```
Hola {{1}} 👋, tu cita en *Tu Peluquería* ha quedado reservada:

📅 {{2}}
✂️ {{3}}
💇 Con {{4}}

Responde *SI* para confirmar tu asistencia o *NO* si necesitas cancelarla.
```

| Variable | Contenido | Ejemplo para la revisión |
|---|---|---|
| `{{1}}` | Nombre del cliente | Ana |
| `{{2}}` | Fecha y hora | martes, 7 de octubre, 10:30 |
| `{{3}}` | Servicios | Corte mujer, Tratamiento hidratante |
| `{{4}}` | Profesional | Lucía Martín |

*Opcional:* añade dos botones de respuesta rápida, **SI** y **NO**. Su texto llega como mensaje y la app ya lo interpreta.

### 2. `recordatorio`

```
Hola {{1}}, te recordamos tu cita en *Tu Peluquería*:

📅 {{2}}
✂️ {{3}}

Responde *SI* para confirmar tu asistencia o *NO* si necesitas cancelarla.
```

| Variable | Contenido | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Ana |
| `{{2}}` | Fecha y hora | martes, 7 de octubre, 10:30 |
| `{{3}}` | Servicios | Corte mujer |

### 3. `cambio`

```
Hola {{1}}, tu cita en *Tu Peluquería* ha cambiado. Nuevos datos:

📅 {{2}}
✂️ {{3}}
💇 Con {{4}}

Responde *SI* para confirmar tu asistencia o *NO* si necesitas cancelarla.
```

Las variables son las mismas que en `confirmacion`.

### 4. `cancelacion`

```
Hola {{1}}, tu cita del {{2}} en *Tu Peluquería* ha sido cancelada. Si quieres una nueva cita, escríbenos o llámanos.
```

| Variable | Contenido | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre del cliente | Ana |
| `{{2}}` | Fecha y hora | martes, 7 de octubre, 10:30 |

---

## Cómo darlas de alta

**Twilio:** *Messaging → Content Template Builder → Create new*. Elige el tipo *Text* (o *Quick reply* si quieres los botones), pega el texto, envíala a aprobación de WhatsApp y copia su **Content SID** (`HX...`) en la variable correspondiente.

**Meta:** *WhatsApp Manager → Plantillas de mensajes → Crear plantilla*. Elige la categoría *Utilidad*, pega el texto en el cuerpo, añade los ejemplos de las variables y envíala. Cuando esté aprobada, pon su **nombre** en la variable correspondiente.

## Probar el envío real

Con las credenciales en el `.env`:

```bash
cd backend
npm run whatsapp:test -- +34600111222                # texto libre (sandbox / ventana de 24 h)
npm run whatsapp:test -- +34600111222 recordatorio   # con la plantilla aprobada
```

El script avisa si la plantilla pedida no está configurada.
