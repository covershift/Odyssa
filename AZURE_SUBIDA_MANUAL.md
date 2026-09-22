# Subida manual de Odyssa a Azure App Service

## Archivo que debes cargar

En **Centro de implementación > Implementación manual > Publicar archivos**, carga:

`odyssa-azure-upload.zip`

El ZIP ya tiene los archivos en la raíz; no lo descomprimas ni vuelvas a comprimir.

## Configuración del App Service

- Publicar: **Código**
- Sistema operativo: **Linux**
- Pila: **Node 24 LTS**
- Plan: **Free F1**
- Comando de inicio: normalmente puede quedar vacío. Si Azure no inicia la aplicación, usa `npm start`.

## Variables de entorno obligatorias

Después de subir el ZIP, abre **Configuración > Variables de entorno** y agrega:

- `NODE_ENV` = `production`
- `ODYSSA_ADMIN_PASSWORD` = una contraseña segura para administración
- `ODYSSA_RECEPTION_PASSWORD` = otra contraseña segura para recepción

Opcionalmente puedes cambiar los usuarios:

- `ODYSSA_ADMIN_USER` = `admin`
- `ODYSSA_RECEPTION_USER` = `recepcion`

Guarda los cambios y acepta el reinicio de la aplicación.

La aplicación no iniciará en Azure hasta que ambas contraseñas estén configuradas. Los usuarios predeterminados son `admin` y `recepcion`.

## Datos persistentes

En Azure, el sistema guarda automáticamente las citas y demás tablas en:

`/home/data/odyssa`

Las próximas subidas del ZIP actualizarán la aplicación sin reemplazar esos datos.

## Verificación

1. Abre **Examinar** desde el App Service.
2. Inicia sesión con ambos perfiles.
3. Confirma que Recepción no vea Dashboard ni Reportes.
4. Crea una cita de prueba, reinicia el App Service y confirma que la cita continúa registrada.
