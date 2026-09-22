/**
 * ODYSSA NAIL SALON MANAGEMENT SYSTEM - LOCAL SERVER
 * 
 * Servidor local nativo en Node.js para gestión y persistencia en archivos planos (.txt).
 * No requiere instalación de paquetes npm externos.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const APP_DIR = __dirname;
const BUSINESS_TIME_ZONE = 'America/Lima';
const IS_AZURE_APP_SERVICE = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);
const DATA_DIR = process.env.ODYSSA_DATA_DIR
    ? path.resolve(process.env.ODYSSA_DATA_DIR)
    : (IS_AZURE_APP_SERVICE && process.env.HOME
        ? path.join(process.env.HOME, 'data', 'odyssa')
        : APP_DIR);
const AUTH_USERS = [
    {
        username: process.env.ODYSSA_ADMIN_USER || process.env.ODYSSA_USER || 'admin',
        password: process.env.ODYSSA_ADMIN_PASSWORD || process.env.ODYSSA_PASSWORD || '',
        role: 'admin',
        displayName: 'Administrador'
    },
    {
        username: process.env.ODYSSA_RECEPTION_USER || 'recepcion',
        password: process.env.ODYSSA_RECEPTION_PASSWORD || '',
        role: 'reception',
        displayName: 'Recepción'
    }
];
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

// Lista de tablas gestionadas como archivos planos .txt
const TABLE_FILES = {
    services: 'services.txt',
    workers: 'workers.txt',
    clients: 'clients.txt',
    appointments: 'appointments.txt',
    sales: 'sales.txt',
    schedule: 'schedule.txt',
    config: 'config.txt'
};

function parseCookies(cookieHeader = '') {
    return cookieHeader.split(';').reduce((cookies, item) => {
        const separator = item.indexOf('=');
        if (separator === -1) return cookies;
        const key = item.slice(0, separator).trim();
        const value = item.slice(separator + 1).trim();
        if (key) cookies[key] = decodeURIComponent(value);
        return cookies;
    }, {});
}

function getSession(req) {
    const token = parseCookies(req.headers.cookie).odyssa_session;
    if (!token) return null;
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (session) sessions.delete(token);
        return null;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return { token, ...session };
}

function buildSessionCookie(req, token, maxAgeSeconds) {
    const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const secureRequest = Boolean(req.socket.encrypted || forwardedProtocol === 'https');
    return `odyssa_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secureRequest ? '; Secure' : ''}`;
}

function sendJson(res, status, payload, extraHeaders = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extraHeaders
    });
    res.end(JSON.stringify(payload));
}

function readJsonBody(req, callback) {
    let body = '';
    req.on('data', chunk => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
        try {
            callback(null, JSON.parse(body || '{}'));
        } catch (error) {
            callback(error);
        }
    });
}

function getBusinessDateTimeParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
    }, {});

    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`,
        seconds: Number(parts.second || 0),
        minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute)
    };
}

function getTodayISOString() {
    return getBusinessDateTimeParts().date;
}

function getYesterdayISOString() {
    const today = getBusinessDateTimeParts().date;
    const previousDate = new Date(`${today}T12:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    return previousDate.toISOString().slice(0, 10);
}

// Datos iniciales de demostración en caso de que los archivos .txt no existan
function getInitialDemoData() {
    return {
        config: {
            salonName: 'Odyssa Nail Spa Studio',
            phone: '+51 987 654 321',
            address: 'Av. La Encalada 1230, Santiago de Surco, Lima'
        },
        services: [
            { id: 'SERV-1', name: 'Manicure Rusa Gel', category: 'Gel', price: 65.00, duration: 45, description: 'Limpieza profunda con torno y esmaltado en gel de alta duración.', active: true },
            { id: 'SERV-2', name: 'Pedicure Spa Completa', category: 'Pedicure', price: 75.00, duration: 60, description: 'Exfoliación, hidratación de pies y esmaltado en tono a elección.', active: true },
            { id: 'SERV-3', name: 'Uñas Acrílicas Esculpidas', category: 'Acrílicas', price: 120.00, duration: 90, description: 'Extensión esculpida con acrílico de alta calidad y acabado natural.', active: true },
            { id: 'SERV-4', name: 'Soft Gel Tip Extensión', category: 'Gel', price: 95.00, duration: 75, description: 'TIPS de gel curados en lámpara LED con diseño base.', active: true },
            { id: 'SERV-5', name: 'Nail Art Diseños 3D (por uña)', category: 'Nail Art', price: 15.00, duration: 20, description: 'Diseño a mano alzada con relieve o pedrería fina.', active: true },
            { id: 'SERV-6', name: 'Retiro de Acrílico / Gel', category: 'Tratamientos', price: 30.00, duration: 30, description: 'Retiro seguro respetando la placa ungueal natural.', active: true },
            { id: 'SERV-7', name: 'Esmaltado Semi-Permanente', category: 'Manicure', price: 50.00, duration: 40, description: 'Esmaltado de secado rápido que dura más de 21 días.', active: true },
            { id: 'SERV-8', name: 'Tratamiento Parafina Hidratante', category: 'Tratamientos', price: 40.00, duration: 25, description: 'Baño de parafina suave para manos secas y agrietadas.', active: true },
            { id: 'SERV-9', name: 'Kombi Manicure Express', category: 'Manicure', price: 40.00, duration: 30, description: 'Manicure rápida con arreglo de cutículas y brillo.', active: true },
            { id: 'SERV-10', name: 'Pedicure Médica Podológica', category: 'Pedicure', price: 90.00, duration: 60, description: 'Atención especializada para durezas y talones resecos.', active: true }
        ],
        workers: [
            { id: 'WRK-1', name: 'Valeria', lastname: 'Mendoza', phone: '987111222', email: 'valeria@odyssa.pe', services: ['SERV-1', 'SERV-3', 'SERV-4', 'SERV-5'], active: true },
            { id: 'WRK-2', name: 'Camila', lastname: 'Ríos', phone: '987333444', email: 'camila@odyssa.pe', services: ['SERV-1', 'SERV-2', 'SERV-7', 'SERV-8'], active: true },
            { id: 'WRK-3', name: 'Stefany', lastname: 'García', phone: '987555666', email: 'stefany@odyssa.pe', services: ['SERV-2', 'SERV-3', 'SERV-6', 'SERV-10'], active: true },
            { id: 'WRK-4', name: 'Lucía', lastname: 'Torres', phone: '987777888', email: 'lucia@odyssa.pe', services: ['SERV-4', 'SERV-5', 'SERV-7', 'SERV-9'], active: true },
            { id: 'WRK-5', name: 'Gabriela', lastname: 'Paredes', phone: '987999000', email: 'gabriela@odyssa.pe', services: ['SERV-1', 'SERV-2', 'SERV-3', 'SERV-7'], active: true }
        ],
        clients: [
            { id: 'CLI-1', name: 'Sophia', lastname: 'Alvarez', phone: '908800442', birthdate: '1996-09-21', email: 'sasoporte10@gmail.com', notes: 'Prefiere tonos nude y rosados pálidos.' },
            { id: 'CLI-2', name: 'Andrea', lastname: 'Benitez', phone: '988234567', birthdate: '1998-04-15', email: 'andrea@gmail.com', notes: 'Sensibilidad en cutículas.' },
            { id: 'CLI-3', name: 'Mariana', lastname: 'Castañeda', phone: '977345678', birthdate: '1994-11-08', email: 'mariana@hotmail.com', notes: 'Uñas acrílicas forma almendrada.' },
            { id: 'CLI-4', name: 'Fiorella', lastname: 'Delgado', phone: '966456789', birthdate: '1995-09-25', email: 'fiorella@outlook.com', notes: 'Cliente frecuente de Pedicure Spa.' },
            { id: 'CLI-5', name: 'Daniela', lastname: 'Espinoza', phone: '955567890', birthdate: '1997-02-14', email: 'daniela@yahoo.com', notes: 'Le gustan los diseños florales.' }
        ],
        schedule: [
            { day: 'Lunes', open: '09:00', close: '18:00', active: true },
            { day: 'Martes', open: '09:00', close: '18:00', active: true },
            { day: 'Miércoles', open: '09:00', close: '18:00', active: true },
            { day: 'Jueves', open: '09:00', close: '20:00', active: true },
            { day: 'Viernes', open: '09:00', close: '20:00', active: true },
            { day: 'Sábado', open: '09:00', close: '17:00', active: true },
            { day: 'Domingo', open: '10:00', close: '14:00', active: false }
        ],
        appointments: [
            { id: 'APT-101', clientId: 'CLI-1', workerId: 'WRK-1', serviceId: 'SERV-1', date: getTodayISOString(), time: '10:00', duration: 45, endTime: '10:45', status: 'Completada', notes: 'Manicure rusa impecable' },
            { id: 'APT-102', clientId: 'CLI-2', workerId: 'WRK-2', serviceId: 'SERV-2', date: getTodayISOString(), time: '11:00', duration: 60, endTime: '12:00', status: 'En atención', notes: 'Atención confirmada' },
            { id: 'APT-103', clientId: 'CLI-3', workerId: 'WRK-3', serviceId: 'SERV-3', date: getTodayISOString(), time: '14:30', duration: 90, endTime: '16:00', status: 'Confirmada', notes: 'Acrílicas baby boomer' },
            { id: 'APT-104', clientId: 'CLI-4', workerId: 'WRK-4', serviceId: 'SERV-4', date: getTodayISOString(), time: '16:00', duration: 75, endTime: '17:15', status: 'Reservada', notes: 'Tip suave' }
        ],
        sales: [
            { id: 'VEN-201', clientId: 'CLI-1', workerId: 'WRK-1', serviceId: 'SERV-1', price: 65.00, discount: 0, total: 65.00, paymentMethod: 'Yape', date: getTodayISOString(), time: '10:50' },
            { id: 'VEN-202', clientId: 'CLI-4', workerId: 'WRK-2', serviceId: 'SERV-2', price: 75.00, discount: 5.00, total: 70.00, paymentMethod: 'Tarjeta', date: getTodayISOString(), time: '12:15' },
            { id: 'VEN-203', clientId: 'CLI-5', workerId: 'WRK-3', serviceId: 'SERV-3', price: 120.00, discount: 10.00, total: 110.00, paymentMethod: 'Plin', date: getYesterdayISOString(), time: '15:20' },
            { id: 'VEN-204', clientId: 'CLI-2', workerId: 'WRK-4', serviceId: 'SERV-7', price: 50.00, discount: 0, total: 50.00, paymentMethod: 'Efectivo', date: getYesterdayISOString(), time: '16:40' }
        ]
    };
}

// Asegura que cada archivo .txt exista; si no existe, lo crea con datos iniciales
function ensureAllFilesExist() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const demoData = getInitialDemoData();
    for (const [tableKey, filename] of Object.entries(TABLE_FILES)) {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
            const packagedSeedFile = path.join(APP_DIR, filename);
            if (DATA_DIR !== APP_DIR && fs.existsSync(packagedSeedFile)) {
                fs.copyFileSync(packagedSeedFile, filePath);
                console.log(`[INICIALIZADO] Datos copiados al almacenamiento persistente: ${filename}`);
            } else {
                const content = JSON.stringify(demoData[tableKey] || [], null, 2);
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`[CREADO] Archivo plano creado: ${filename}`);
            }
        }
    }
}

// Lee una tabla desde su archivo .txt
function readTableFile(tableKey) {
    const filename = TABLE_FILES[tableKey];
    if (!filename) return null;
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        ensureAllFilesExist();
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Error leyendo ${filename}:`, err);
        return tableKey === 'config' ? {} : [];
    }
}

// Escribe una tabla en su archivo plano .txt
function writeTableFile(tableKey, data) {
    const filename = TABLE_FILES[tableKey];
    if (!filename) return false;
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
}

// Carga todas las tablas desde los archivos planos
function loadAllTables() {
    ensureAllFilesExist();
    synchronizeAppointmentStatuses();
    const result = {};
    for (const tableKey of Object.keys(TABLE_FILES)) {
        result[tableKey] = readTableFile(tableKey);
    }
    return result;
}

// Guarda todas las tablas enviadas en los archivos planos
function saveAllTables(data) {
    ensureAllFilesExist();
    for (const [tableKey, tableData] of Object.entries(data)) {
        if (TABLE_FILES[tableKey]) {
            writeTableFile(
                tableKey,
                tableKey === 'appointments' ? applyAutomaticAppointmentStatuses(tableData).appointments : tableData
            );
        }
    }
}

function applyAutomaticAppointmentStatuses(appointments, now = new Date()) {
    const businessNow = getBusinessDateTimeParts(now);
    const changedIds = [];
    const normalizedAppointments = Array.isArray(appointments) ? appointments : [];

    normalizedAppointments.forEach(appointment => {
        if (!appointment || !['Reservada', 'Confirmada'].includes(appointment.status)) return;
        if (appointment.date !== businessNow.date || !/^\d{2}:\d{2}$/.test(String(appointment.time || ''))) return;

        const [hours, minutes] = appointment.time.split(':').map(Number);
        const scheduledMinute = hours * 60 + minutes;
        if (!Number.isFinite(scheduledMinute) || businessNow.minuteOfDay < scheduledMinute) return;

        appointment.status = 'En atención';
        appointment.actualStartTime = appointment.time;
        appointment.startedAt = now.toISOString();
        appointment.startedBy = 'sistema';
        appointment.startedAutomatically = true;
        changedIds.push(appointment.id);
    });

    return { appointments: normalizedAppointments, changedIds, businessNow };
}

function synchronizeAppointmentStatuses(now = new Date()) {
    const appointments = readTableFile('appointments');
    const result = applyAutomaticAppointmentStatuses(appointments, now);
    if (result.changedIds.length > 0) writeTableFile('appointments', result.appointments);
    return result;
}

// Tipos MIME para servir archivos estáticos
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Crear servidor HTTP
const server = http.createServer((req, res) => {
    // Configuración CORS para acceso desde cualquier origen
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // AUTENTICACIÓN LOCAL SIMPLE (preparada para reemplazarse por MFA)
    if (req.method === 'POST' && pathname === '/api/login') {
        readJsonBody(req, (error, credentials) => {
            if (error) {
                sendJson(res, 400, { success: false, message: 'Solicitud no válida.' });
                return;
            }

            const user = AUTH_USERS.find(account => (
                String(credentials.username || '') === account.username &&
                String(credentials.password || '') === account.password
            ));
            if (!user) {
                sendJson(res, 401, { success: false, message: 'Usuario o contraseña incorrectos.' });
                return;
            }

            const token = crypto.randomBytes(32).toString('hex');
            const sessionUser = { username: user.username, role: user.role, displayName: user.displayName };
            sessions.set(token, { ...sessionUser, expiresAt: Date.now() + SESSION_TTL_MS });
            sendJson(res, 200, { success: true, user: sessionUser, data: loadAllTables() }, {
                'Set-Cookie': buildSessionCookie(req, token, SESSION_TTL_MS / 1000)
            });
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/session') {
        const session = getSession(req);
        if (!session) {
            sendJson(res, 401, { authenticated: false });
            return;
        }
        sendJson(res, 200, {
            authenticated: true,
            user: { username: session.username, role: session.role, displayName: session.displayName }
        }, {
            'Set-Cookie': buildSessionCookie(req, session.token, SESSION_TTL_MS / 1000)
        });
        return;
    }

    // Una sola solicitud restaura la sesión y carga el estado necesario para pintar la app.
    if (req.method === 'GET' && pathname === '/api/bootstrap') {
        const session = getSession(req);
        if (!session) {
            sendJson(res, 401, { authenticated: false });
            return;
        }
        sendJson(res, 200, {
            authenticated: true,
            user: { username: session.username, role: session.role, displayName: session.displayName },
            data: loadAllTables()
        }, {
            'Set-Cookie': buildSessionCookie(req, session.token, SESSION_TTL_MS / 1000)
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
        const session = getSession(req);
        if (session) sessions.delete(session.token);
        sendJson(res, 200, { success: true }, {
            'Set-Cookie': buildSessionCookie(req, '', 0)
        });
        return;
    }

    if (pathname.startsWith('/api/') && !getSession(req)) {
        sendJson(res, 401, { success: false, message: 'Sesión no válida o expirada.' });
        return;
    }

    // ENDPOINT: Obtener todas las tablas desde archivos planos (.txt)
    if (req.method === 'GET' && pathname === '/api/tables') {
        sendJson(res, 200, loadAllTables());
        return;
    }

    // Actualiza citas vencidas para iniciar usando la hora oficial de Lima (GMT-5).
    if (req.method === 'POST' && pathname === '/api/appointments/sync-status') {
        const result = synchronizeAppointmentStatuses();
        sendJson(res, 200, {
            success: true,
            appointments: result.appointments,
            changedIds: result.changedIds,
            businessDate: result.businessNow.date,
            businessTime: result.businessNow.time,
            timeZone: BUSINESS_TIME_ZONE
        });
        return;
    }

    // ENDPOINT: Guardar todas las tablas en sus respectivos archivos planos (.txt)
    if (req.method === 'POST' && pathname === '/api/save') {
        readJsonBody(req, (error, parsed) => {
            try {
                if (error) throw error;
                saveAllTables(parsed);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, message: 'Datos guardados en archivos planos .txt' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // ENDPOINT: Guardar una tabla individual en su archivo plano .txt (/api/table/:name)
    if (req.method === 'POST' && pathname.startsWith('/api/table/')) {
        const tableName = pathname.replace('/api/table/', '');
        if (!TABLE_FILES[tableName]) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: `Tabla '${tableName}' no reconocida` }));
            return;
        }

        readJsonBody(req, (error, parsed) => {
            try {
                if (error) throw error;
                writeTableFile(
                    tableName,
                    tableName === 'appointments' ? applyAutomaticAppointmentStatuses(parsed).appointments : parsed
                );
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, table: tableName }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ENDPOINT: Restablecer todos los archivos .txt a datos iniciales de fábrica
    if (req.method === 'POST' && pathname === '/api/reset') {
        const demoData = getInitialDemoData();
        saveAllTables(demoData);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, data: demoData }));
        return;
    }

    // SERVIR ARCHIVOS ESTÁTICOS
    let filePath = path.join(APP_DIR, pathname === '/' ? 'odyssa_nail_salon_management_system.html' : pathname);

    // Los archivos de datos solo se exponen mediante la API autenticada.
    if (Object.values(TABLE_FILES).includes(path.basename(filePath))) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Recurso no encontrado');
        return;
    }

    // Si la ruta solicitada no existe pero es la raíz o un archivo HTML
    if (!fs.existsSync(filePath) && (pathname === '/' || pathname === '/index.html')) {
        filePath = path.join(APP_DIR, 'odyssa_nail_salon_management_system.html');
    }

    const resolvedFilePath = path.resolve(filePath);
    const relativeFilePath = path.relative(APP_DIR, resolvedFilePath);
    const allowedRootFiles = new Set(['odyssa_nail_salon_management_system.html', 'Logo.jpeg']);
    const isAllowedAsset = relativeFilePath.startsWith(`assets${path.sep}`) && ['.css', '.png', '.jpg', '.jpeg', '.svg', '.ico'].includes(path.extname(relativeFilePath).toLowerCase());
    const isAllowedStaticFile = allowedRootFiles.has(relativeFilePath) || isAllowedAsset;

    if (relativeFilePath.startsWith('..') || path.isAbsolute(relativeFilePath) || !isAllowedStaticFile) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Recurso no encontrado');
        return;
    }

    if (fs.existsSync(resolvedFilePath) && fs.statSync(resolvedFilePath).isFile()) {
        const ext = path.extname(resolvedFilePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const stats = fs.statSync(resolvedFilePath);
        const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
        const cacheControl = ext === '.html'
            ? 'no-cache'
            : 'public, max-age=3600, must-revalidate';
        const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
        const shouldCompress = acceptsGzip && ['.html', '.css', '.js', '.json', '.svg'].includes(ext);
        const staticHeaders = {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'ETag': etag,
            'Last-Modified': stats.mtime.toUTCString(),
            'Vary': 'Accept-Encoding',
            ...(shouldCompress ? { 'Content-Encoding': 'gzip' } : {})
        };

        if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, staticHeaders);
            res.end();
            return;
        }

        res.writeHead(200, staticHeaders);
        const fileStream = fs.createReadStream(resolvedFilePath);
        if (shouldCompress) {
            fileStream.pipe(zlib.createGzip()).pipe(res);
        } else {
            fileStream.pipe(res);
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Recurso no encontrado');
    }
});

// Inicializar archivos planos antes de escuchar
const missingPasswordRoles = AUTH_USERS.filter(account => !account.password).map(account => account.displayName);
if (missingPasswordRoles.length > 0) {
    throw new Error(`Faltan contraseñas para: ${missingPasswordRoles.join(', ')}. Configure ODYSSA_ADMIN_PASSWORD y ODYSSA_RECEPTION_PASSWORD.`);
}

ensureAllFilesExist();

server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` ODYSSA NAIL SALON MANAGEMENT SYSTEM`);
    console.log(` Almacenamiento activo en Archivos Planos (.txt):`);
    console.log(` Directorio de datos: ${DATA_DIR}`);
    Object.entries(TABLE_FILES).forEach(([tbl, file]) => {
        console.log(`  - ${tbl.padEnd(14)} -> ${file}`);
    });
    console.log(` Servidor local ejecutándose en: http://localhost:${PORT}`);
    console.log(`=======================================================`);
});
