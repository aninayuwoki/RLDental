/**
 * BOT DE WHATSAPP PARA RLDENTAL - VERSIÓN FINAL FUNCIONAL
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

// ========== CONFIGURACIÓN ==========
const PORT = 3001;
const CONFIG_FILE = path.join(__dirname, 'rldental-config.json');
const APPOINTMENTS_FILE = path.join(__dirname, 'appointments.json');
const USER_STATES_FILE = path.join(__dirname, 'user-states.json');

// ⚠️ IMPORTANTE: Tu número personal para recibir notificaciones
const ADMIN_PHONE = '593997982617@c.us';

// ========== CONFIGURACIÓN INICIAL ==========
const defaultConfig = {
  businessPhone: '593978719532',
  schedule: {
    'Lunes': { open: '08:00', close: '18:00', slots: ['08:00', '10:00', '12:00', '14:00', '16:00'] },
    'Martes': { open: '08:00', close: '18:00', slots: ['08:00', '10:00', '12:00', '14:00', '16:00'] },
    'Miércoles': { open: '08:00', close: '18:00', slots: ['08:00', '10:00', '12:00', '14:00', '16:00'] },
    'Jueves': { open: '08:00', close: '18:00', slots: ['08:00', '10:00', '12:00', '14:00', '16:00'] },
    'Viernes': { open: '08:00', close: '18:00', slots: ['08:00', '10:00', '12:00', '14:00', '16:00'] },
    'Sábado': { open: '08:00', close: '14:00', slots: ['08:00', '10:00', '12:00'] }
  },
  services: ['Odontología General', 'Cirugía Bucal', 'Odontopediatría', 'Ortodoncia']
};

// ========== INICIALIZAR CLIENTE WHATSAPP ==========
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'rldental-bot' }),
  puppeteer: {
    headless: true, // Para depuración
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// ========== INICIALIZAR SERVIDOR API ==========
const app = express();
app.use(cors());
app.use(express.json());

// ========== FUNCIONES AUXILIARES ==========
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    await saveConfig(defaultConfig);
    return defaultConfig;
  }
}

async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

async function loadAppointments() {
  try {
    const data = await fs.readFile(APPOINTMENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveAppointments(appointments) {
  await fs.writeFile(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2), 'utf8');
}

async function loadUserStates() {
  try {
    const data = await fs.readFile(USER_STATES_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return new Map(Object.entries(parsed));
  } catch (error) {
    return new Map();
  }
}

async function saveUserStates() {
  try {
    const obj = Object.fromEntries(userStates);
    await fs.writeFile(USER_STATES_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (error) {
    console.error('❌ Error guardando estados de usuario:', error.message);
  }
}

function generateAppointmentId() {
  return `CITA-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long',
    year: 'numeric'
  });
}

async function getAvailableSlots(date) {
  const config = await loadConfig();
  const appointments = await loadAppointments();
  
  const dateObj = new Date(date);
  const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
  const dayCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  
  if (!config.schedule[dayCapitalized]) return [];
  
  const allSlots = config.schedule[dayCapitalized].slots;
  const dateKey = date;
  
  const occupiedSlots = [];
  if (appointments[dateKey]) {
    Object.values(appointments[dateKey]).forEach(apt => {
      if (apt.status === 'confirmed' || apt.status === 'pending') {
        occupiedSlots.push(apt.time);
      }
    });
  }
  
  return allSlots.filter(slot => !occupiedSlots.includes(slot));
}

function isAdmin(phone) {
  return phone.includes('593997982617');
}

async function sendMessageSafe(phone, message) {
  try {
    console.log(`Intentando enviar a ${phone}: ${message.substring(0, 50)}...`);
    await client.sendMessage(phone, message);
    console.log(`✅ Enviado exitosamente a ${phone}`);
    return true;
  } catch (error) {
    console.error(`❌ Error detallado enviando a ${phone}:`, error.stack);
    return false;
  }
}

// ========== ESTADO DE CONVERSACIONES ==========
let userStates = new Map();
loadUserStates().then(s => userStates = s);

// ========== MANEJADOR ÚNICO DE MENSAJES ==========
client.on('message', async (msg) => {
  console.log('📥 Mensaje crudo recibido:', msg.from, msg.body, msg.type);
  try {
    // Filtrar mensajes inválidos
    if (msg.from.includes('@g.us') || 
        msg.from.includes('@broadcast') ||
        msg.from.includes('@lid') || 
        msg.isStatus) {
      console.log(`⚠️ Mensaje ignorado por filtro: ${msg.from} (tipo inválido)`);
      return;
    }

    const phone = msg.from;
    let text = msg.body ? msg.body.trim() : '';

    // Manejar mensajes sin texto (multimedia)
    if (!text && msg.hasMedia) {
      text = "[Archivo multimedia o mensaje no soportado]";
    }
    
    if (!text) return;

    console.log(`📱 Mensaje de ${phone}: ${text}`);

    const chat = await msg.getChat();
    // await chat.sendStateTyping(); // Comentado

    if (!isAdmin(phone)) {
      const forwarded = `📩 De ${phone}: ${text}`;
      await sendMessageSafe(ADMIN_PHONE, forwarded);
    }

    if (isAdmin(phone)) {
      const handled = await handleAdminCommands(phone, text);
      if (handled) return;
      return; // No procesar mensajes de admin en el flujo de citas
    }

    await handleAppointmentFlow(phone, text);

  } catch (error) {
    console.error('❌ Error procesando mensaje:', error.message);
  }
});

// ========== COMANDOS DE ADMINISTRADOR ==========
async function handleAdminCommands(phone, text) {
  const cmd = text.toLowerCase();
  
  // Ver citas pendientes
  if (cmd === 'citas' || cmd === '/citas') {
    const appointments = await loadAppointments();
    let pendingCount = 0;
    let pendingList = '*📋 CITAS PENDIENTES:*\n\n';
    
    for (const [date, slots] of Object.entries(appointments)) {
      for (const [time, apt] of Object.entries(slots)) {
        if (apt.status === 'pending') {
          pendingCount++;
          pendingList += `*${apt.id}*\n`;
          pendingList += `👤 ${apt.patientName}\n`;
          if (apt.patientAge) pendingList += `👶 ${apt.patientAge} años\n`;
          pendingList += `🦷 ${apt.service}\n`;
          pendingList += `📅 ${formatDate(date)}\n`;
          pendingList += `🕐 ${time}\n`;
          pendingList += `📱 ${apt.phone}\n\n`;
          pendingList += `Para confirmar: *confirmar ${apt.id}*\n`;
          pendingList += `Para rechazar: *rechazar ${apt.id}*\n\n`;
          pendingList += `━━━━━━━━━━━━━━━━━\n\n`;
        }
      }
    }
    
    if (pendingCount === 0) {
      await sendMessageSafe(phone, '✅ No hay citas pendientes.');
    } else {
      await sendMessageSafe(phone, pendingList);
    }
    return true;
  }
  
  // Ver todas las citas
  if (cmd === 'todas' || cmd === '/todas') {
    const appointments = await loadAppointments();
    let allList = '*📅 TODAS LAS CITAS:*\n\n';
    
    const sortedDates = Object.keys(appointments).sort();
    
    for (const date of sortedDates) {
      const dateFormatted = formatDate(date);
      allList += `*${dateFormatted}*\n`;
      
      const sortedTimes = Object.keys(appointments[date]).sort();
      for (const time of sortedTimes) {
        const apt = appointments[date][time];
        const statusEmoji = {
          'pending': '⏳',
          'confirmed': '✅',
          'rejected': '❌',
          'cancelled': '🚫'
        }[apt.status] || '❓';
        
        allList += `  ${statusEmoji} ${time} - ${apt.patientName} (${apt.service})\n`;
      }
      allList += '\n';
    }
    
    await sendMessageSafe(phone, allList);
    return true;
  }
  
  // Confirmar cita
  if (cmd.startsWith('confirmar ')) {
    const aptId = text.substring(10).trim();
    const result = await updateAppointmentStatus(aptId, 'confirmed');
    
    if (result.success) {
      await sendMessageSafe(phone, `✅ Cita *${aptId}* confirmada`);
      
      const patientMessage = `✅ *CITA CONFIRMADA* ✅\n\n` +
        `Hola ${result.appointment.patientName},\n\n` +
        `Tu cita ha sido confirmada:\n\n` +
        `🦷 *Servicio:* ${result.appointment.service}\n` +
        `📅 *Fecha:* ${formatDate(result.appointment.date)}\n` +
        `🕐 *Hora:* ${result.appointment.time}\n\n` +
        `📍 *RLDental - Reigosa León Dental*\n\n` +
        `Te esperamos! 😊`;
      
      await sendMessageSafe(result.appointment.phone, patientMessage);
    } else {
      await sendMessageSafe(phone, `❌ ${result.message}`);
    }
    return true;
  }
  
  // Rechazar cita
  if (cmd.startsWith('rechazar ')) {
    const aptId = text.substring(9).trim();
    const result = await updateAppointmentStatus(aptId, 'rejected');
    
    if (result.success) {
      await sendMessageSafe(phone, `❌ Cita *${aptId}* rechazada y horario liberado`);
      
      const patientMessage = `Lo sentimos ${result.appointment.patientName},\n\n` +
        `No pudimos confirmar tu cita para:\n` +
        `📅 ${formatDate(result.appointment.date)} a las ${result.appointment.time}\n\n` +
        `Por favor, selecciona otro horario disponible.`;
      
      await sendMessageSafe(result.appointment.phone, patientMessage);
    } else {
      await sendMessageSafe(phone, `❌ ${result.message}`);
    }
    return true;
  }
  
  // Ayuda
  if (cmd === 'ayuda' || cmd === '/ayuda' || cmd === 'admin') {
    const helpText = `*🔧 COMANDOS DE ADMINISTRADOR*\n\n` +
      `📋 *citas* - Ver citas pendientes\n` +
      `📅 *todas* - Ver todas las citas\n` +
      `✅ *confirmar CITA-XXX* - Confirmar cita\n` +
      `❌ *rechazar CITA-XXX* - Rechazar cita\n` +
      `❓ *ayuda* - Ver este mensaje`;
    
    await sendMessageSafe(phone, helpText);
    return true;
  }
  
  return false; // No fue un comando de admin
}

async function updateAppointmentStatus(aptId, newStatus) {
  const appointments = await loadAppointments();
  
  for (const [date, slots] of Object.entries(appointments)) {
    for (const [time, apt] of Object.entries(slots)) {
      if (apt.id === aptId) {
        apt.status = newStatus;
        apt.updatedAt = new Date().toISOString();
        
        if (newStatus === 'rejected') {
          delete appointments[date][time];
          if (Object.keys(appointments[date]).length === 0) {
            delete appointments[date];
          }
        }
        
        await saveAppointments(appointments);
        return { success: true, appointment: apt };
      }
    }
  }
  
  return { success: false, message: 'Cita no encontrada' };
}

// ========== FLUJO DE AGENDAMIENTO ==========
async function handleAppointmentFlow(phone, text) {
  const textLower = text.toLowerCase();

  // Comando para reiniciar el flujo
  if (textLower === 'reiniciar' || textLower === 'cancelar') {
    userStates.delete(phone);
    await saveUserStates();
    await sendMessageSafe(phone, '🔄 Proceso reiniciado. Escribe *"hola"* para comenzar de nuevo.');
    return;
  }

  const state = userStates.get(phone) || { step: 'initial' };
  
  switch (state.step) {
    case 'initial':
      // Mensaje de bienvenida
      if (textLower.includes('hola') || 
          textLower.includes('buenos') ||
          textLower.includes('buenas') ||
          textLower.includes('cita') || 
          textLower.includes('agendar') ||
          textLower.includes('turno')) {
        
        const welcomeMsg = `¡Bienvenido a *RLDental*! 🦷\n\nSoy tu asistente virtual y te ayudaré a agendar tu cita.\n\nPara comenzar, por favor indícame:\n\n👤 *Tu nombre completo*`;
        
        await sendMessageSafe(phone, welcomeMsg);
        userStates.set(phone, { step: 'waiting_name' });
        await saveUserStates();
      } else {
        // Respuesta genérica para otros mensajes
        const genericMsg = `Hola! 👋\n\nSoy el asistente de *RLDental*.\n\nEscribe *"hola"* o *"cita"* para agendar tu cita dental. 🦷`;
        
        await sendMessageSafe(phone, genericMsg);
      }
      break;
      
    case 'waiting_name':
      state.patientName = text;
      const nameMsg = `Perfecto ${text}! 😊\n\nAhora dime:\n\n🎂 *¿Cuántos años tienes?*\n\n_(Escribe "omitir" si prefieres no decirlo)_`;
      await sendMessageSafe(phone, nameMsg);
      userStates.set(phone, { ...state, step: 'waiting_age' });
      await saveUserStates();
      break;
      
    case 'waiting_age':
      if (textLower !== 'omitir') {
        state.patientAge = text;
      }
      
      const config = await loadConfig();
      const servicesMsg = `Excelente! 👍\n\nAhora selecciona el servicio que necesitas:\n\n${config.services.map((s, i) => `${i + 1}️⃣ ${s}`).join('\n')}\n\n_Responde con el número o el nombre del servicio_`;
      
      await sendMessageSafe(phone, servicesMsg);
      userStates.set(phone, { ...state, step: 'waiting_service' });
      await saveUserStates();
      break;
      
    case 'waiting_service':
      const configSrv = await loadConfig();
      let selectedService = null;
      
      const serviceNum = parseInt(text);
      if (!isNaN(serviceNum) && serviceNum >= 1 && serviceNum <= configSrv.services.length) {
        selectedService = configSrv.services[serviceNum - 1];
      } else {
        selectedService = configSrv.services.find(s => 
          s.toLowerCase().includes(textLower) || textLower.includes(s.toLowerCase())
        );
      }
      
      if (!selectedService) {
        await sendMessageSafe(phone, `❌ Servicio no válido.\n\nPor favor, elige un número de la lista (1, 2, 3 o 4)`);
        return;
      }
      
      state.service = selectedService;
      
      // Generar fechas disponibles
      const dates = [];
      const today = new Date();
      
      for (let i = 1; i <= 14; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dayName = date.toLocaleDateString('es-ES', { weekday: 'long' });
        const dayCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        
        if (configSrv.schedule[dayCapitalized]) {
          dates.push({
            date: date.toISOString().split('T')[0],
            display: date.toLocaleDateString('es-ES', { 
              weekday: 'short', 
              day: 'numeric', 
              month: 'short' 
            })
          });
        }
      }
      
      const datesMsg = `Perfecto! *${selectedService}* 👌\n\n¿Qué día prefieres?\n\n${dates.map((d, i) => `${i + 1}️⃣ ${d.display}`).join('\n')}\n\n_Responde con el número del día_`;
      
      await sendMessageSafe(phone, datesMsg);
      userStates.set(phone, { ...state, step: 'waiting_date', availableDates: dates });
      await saveUserStates();
      break;
      
    case 'waiting_date':
      const dateNum = parseInt(text);
      if (!state.availableDates || isNaN(dateNum) || dateNum < 1 || dateNum > state.availableDates.length) {
        await sendMessageSafe(phone, `❌ Fecha no válida.\n\nPor favor, elige un número de la lista.`);
        return;
      }
      
      const selectedDate = state.availableDates[dateNum - 1];
      state.date = selectedDate.date;
      
      const availableSlots = await getAvailableSlots(selectedDate.date);
      
      if (availableSlots.length === 0) {
        await sendMessageSafe(phone, `😔 Lo sentimos, no hay horarios disponibles para ese día.\n\nPor favor, elige otra fecha.`);
        return;
      }
      
      const slotsMsg = `Genial! *${selectedDate.display}* 📅\n\n¿Qué hora te viene mejor?\n\n${availableSlots.map((s, i) => `${i + 1}️⃣ ${s}`).join('\n')}\n\n_Responde con el número de la hora_`;
      
      await sendMessageSafe(phone, slotsMsg);
      userStates.set(phone, { ...state, step: 'waiting_time', availableSlots });
      await saveUserStates();
      break;
      
    case 'waiting_time':
      const timeNum = parseInt(text);
      if (!state.availableSlots || isNaN(timeNum) || timeNum < 1 || timeNum > state.availableSlots.length) {
        await sendMessageSafe(phone, `❌ Hora no válida.\n\nPor favor, elige un número de la lista.`);
        return;
      }
      
      const selectedTime = state.availableSlots[timeNum - 1];
      state.time = selectedTime;
      
      // Crear la cita
      const aptId = generateAppointmentId();
      const appointments = await loadAppointments();
      
      if (!appointments[state.date]) {
        appointments[state.date] = {};
      }
      
      appointments[state.date][state.time] = {
        id: aptId,
        patientName: state.patientName,
        patientAge: state.patientAge || null,
        service: state.service,
        date: state.date,
        time: state.time,
        phone: phone,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      
      await saveAppointments(appointments);
      
      // Confirmar al paciente
      const confirmationMsg = `✅ *SOLICITUD DE CITA RECIBIDA* ✅\n\n*ID:* ${aptId}\n\n👤 *Nombre:* ${state.patientName}\n${state.patientAge ? `🎂 *Edad:* ${state.patientAge} años\n` : ''}🦷 *Servicio:* ${state.service}\n📅 *Fecha:* ${formatDate(state.date)}\n🕐 *Hora:* ${state.time}\n\n⏳ Tu solicitud está *pendiente de confirmación*.\n\nTe notificaremos pronto por este mismo chat! 😊\n\n_Gracias por confiar en RLDental_ 🦷`;
      
      await sendMessageSafe(phone, confirmationMsg);
      
      // Notificar al administrador
      const adminNotification = `🔔 *NUEVA SOLICITUD DE CITA* 🔔\n\n*ID:* ${aptId}\n\n👤 *Paciente:* ${state.patientName}\n${state.patientAge ? `🎂 *Edad:* ${state.patientAge} años\n` : ''}🦷 *Servicio:* ${state.service}\n📅 *Fecha:* ${formatDate(state.date)}\n🕐 *Hora:* ${state.time}\n📱 *Teléfono:* ${phone}\n\n━━━━━━━━━━━━━━━━━\n\nPara confirmar escribe:\n*confirmar ${aptId}*\n\nPara rechazar escribe:\n*rechazar ${aptId}*`;
      
      await sendMessageSafe(ADMIN_PHONE, adminNotification);
      
      // Limpiar estado
      userStates.delete(phone);
      await saveUserStates();
      break;
  }
}

// ========== API REST ==========

app.get('/api/config', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar configuración' });
  }
});

app.get('/api/availability/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const availableSlots = await getAvailableSlots(date);
    res.json({ date, availableSlots });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener disponibilidad' });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const appointments = await loadAppointments();
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar citas' });
  }
});

// ========== EVENTOS WHATSAPP ==========

client.on('qr', (qr) => {
  console.log('\n🔐 Escanea este código QR con WhatsApp:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n📱 Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo\n');
});

client.on('ready', async () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🦷 BOT WHATSAPP RLDENTAL ACTIVO 🦷      ║
╠════════════════════════════════════════════╣
║  ✅ WhatsApp conectado                    ║
║  ✅ API Server: http://localhost:${PORT}    ║
║                                            ║
║  📱 El bot está listo para recibir citas  ║
║  💬 Los pacientes pueden escribir         ║
║  🔔 Recibirás notificaciones aquí         ║
╚════════════════════════════════════════════╝
  `);
  
  console.log(`\n✅ Bot del negocio: ${defaultConfig.businessPhone}`);
  console.log(`✅ Admin (notificaciones): ${ADMIN_PHONE}\n`);
});

client.on('authenticated', () => {
  console.log('✅ WhatsApp autenticado correctamente');
});

client.on('auth_failure', () => {
  console.error('❌ Error de autenticación');
});

client.on('disconnected', (reason) => {
  console.log('❌ WhatsApp desconectado:', reason);
  console.log('🔄 Intentando reconectar en 10 segundos...');
  setTimeout(() => {
    client.initialize();
  }, 10000);
});

// ========== INICIAR ==========

client.initialize();

app.listen(PORT, () => {
  console.log(`🌐 API Server iniciado en puerto ${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('\n👋 Cerrando bot...');
  await client.destroy();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promesa rechazada:', reason);
});