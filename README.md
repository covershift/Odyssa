# Odyssa Nails Management

Sistema web para la gestión de citas, especialistas, horarios, clientes, atenciones y reportes de Odyssa Nails Studio.

## Funcionalidades

- Agenda diaria y calendario dinámico anual.
- Detalle de citas por estado y trabajadora.
- Horarios semanales individuales y control diario de turnos.
- Perfiles Administrador y Recepción.
- Dashboard y reportes exclusivos para Administración.
- Persistencia local mediante archivos de datos.
- Preparado para Azure App Service sobre Node.js y Linux.

## Ejecución local en Windows

Ejecuta `iniciar_sistema.bat` y abre `http://localhost:3000`.

## Variables obligatorias en producción

- `ODYSSA_ADMIN_PASSWORD`
- `ODYSSA_RECEPTION_PASSWORD`

Variables opcionales:

- `ODYSSA_ADMIN_USER` — valor predeterminado: `admin`
- `ODYSSA_RECEPTION_USER` — valor predeterminado: `recepcion`
- `ODYSSA_DATA_DIR` — ubicación personalizada para los archivos persistentes

## Azure

Consulta `AZURE_SUBIDA_MANUAL.md` para la publicación manual. En Azure App Service los datos se guardan en `/home/data/odyssa`, separados del código desplegado.

## Seguridad de los datos

Los archivos `.txt` operativos no se versionan porque pueden contener información de clientes. Cuando no existen, la aplicación genera automáticamente una estructura inicial de demostración.
