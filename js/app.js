/*
  Configuracion requerida:
  1. service_app_token: token de la Service App de Webex.
  2. CLICK_TO_CALL_CALLED_NUMBER: numero, cola o destino que recibira la llamada.

  Para produccion, no expongas el token de la Service App en el navegador.
  La generacion de guest token y call token deberia hacerse desde un backend.
*/
let service_app_token = 'ZjZlYzkyOTgtMTk4Zi00MzQzLWFhMGYtZTFmYTlmOGQ1MDllMzg4YzVjMGQtMTc2_P0A1_cbbe27d4-1f60-43cb-819b-fd3749c66621';
const CLICK_TO_CALL_CALLED_NUMBER = '6100';
const CLICK_TO_CALL_GUEST_NAME = 'Unidos por la colaboración';
const WEBEX_DISCOVERY_REGION = 'US-EAST';
const WEBEX_DISCOVERY_COUNTRY = 'US';

let callNotification;

class SimpleCallTimer {
  constructor(timerElement) {
    this.timerElement = timerElement;
    this.intervalId = null;
    this.elapsedSeconds = 0;
  }

  start() {
    this.stop();
    this.elapsedSeconds = 0;
    this.render();
    this.intervalId = window.setInterval(() => {
      this.elapsedSeconds += 1;
      this.render();
    }, 1000);
  }

  stop() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.elapsedSeconds = 0;
    this.render();
  }

  render() {
    if (!this.timerElement) return;

    const minutes = String(Math.floor(this.elapsedSeconds / 60)).padStart(2, '0');
    const seconds = String(this.elapsedSeconds % 60).padStart(2, '0');
    this.timerElement.textContent = `${minutes}:${seconds}`;
  }
}

class CallNotificationElement {
  constructor(element, timerElement) {
    this.callNotification = element;
    this.callNotificationTimer = new SimpleCallTimer(timerElement);
  }

  toggle(action) {
    if (!this.callNotification) return this.callNotificationTimer;

    if (action === 'close' || this.callNotification.classList.contains('show-notification')) {
      this.callNotification.classList.remove('show-notification');
      this.callNotificationTimer.stop();
    } else {
      this.callNotification.classList.add('show-notification');
    }

    return this.callNotificationTimer;
  }

  startTimer() {
    if (!this.callNotification) return this.callNotificationTimer;

    this.callNotification.classList.add('timestate');
    this.callNotification.classList.add('show-notification');
    this.callNotificationTimer.start();

    return this.callNotificationTimer;
  }
}

const callNotificationElem = document.getElementById('callNotification');
const callTimer = document.querySelector('#callNotification #timer');
const profileOnline = document.querySelector('.dropbtn #availability');

if (callNotificationElem) {
  callNotification = new CallNotificationElement(callNotificationElem, callTimer);
}

function getClickToCallConfig() {
  return {
    serviceAppToken: service_app_token,
    calledNumber: CLICK_TO_CALL_CALLED_NUMBER,
    guestName: CLICK_TO_CALL_GUEST_NAME,
    region: WEBEX_DISCOVERY_REGION,
    country: WEBEX_DISCOVERY_COUNTRY,
  };
}

function normalizeStatusType(type) {
  if (type === 'ready' || type === 'error' || type === 'loading') return type;
  return 'loading';
}

function setElementState(elementId, message, type) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const state = normalizeStatusType(type);
  element.textContent = message || '';
  element.classList.remove('is-loading', 'is-ready', 'is-error');
  element.classList.add(`is-${state}`);
}

function setClickToCallStatus(message, type = 'loading') {
  const state = normalizeStatusType(type);
  const statusElement = document.getElementById('clickToCallStatus');
  const statusDot = document.getElementById('statusDot');

  if (statusElement) statusElement.textContent = message || '';

  if (statusDot) {
    statusDot.classList.remove('is-loading', 'is-ready', 'is-error');
    statusDot.classList.add(`is-${state}`);
  }

  if (message) {
    const logMethod = state === 'error' ? 'error' : 'info';
    console[logMethod](`[Click to Call] ${message}`);
  }
}

function setConfigIndicator(message, type = 'loading') {
  setElementState('configStatus', message, type);
}

function setAuthIndicator(message, type = 'loading') {
  setElementState('authStatus', message, type);
}

function setLineIndicator(message, type = 'loading') {
  setElementState('lineStatus', message, type);
}

function setClickToCallButtonReady(isReady, statusMessage, statusType = 'loading') {
  const button = document.getElementById('clickToCallBtn') || document.querySelector('.call-support-btn');

  if (button) {
    button.disabled = !isReady;
    button.setAttribute('aria-busy', isReady ? 'false' : 'true');
  }

  if (statusMessage) {
    setClickToCallStatus(statusMessage, isReady ? 'ready' : statusType);
  }
}

function validateClickToCallConfig() {
  const config = getClickToCallConfig();
  const missing = [];

  if (!config.serviceAppToken || !config.serviceAppToken.trim()) missing.push('service_app_token');
  if (!config.calledNumber || !config.calledNumber.trim()) missing.push('CLICK_TO_CALL_CALLED_NUMBER');

  if (missing.length > 0) {
    const message = `Falta configurar: ${missing.join(', ')}`;
    setConfigIndicator(message, 'error');
    setAuthIndicator('Detenida', 'error');
    setLineIndicator('Detenida', 'error');
    setClickToCallButtonReady(false, message, 'error');
    throw new Error(message);
  }

  setConfigIndicator('Completa', 'ready');
  return config;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return {
      error: 'Respuesta no JSON',
      status: response.status,
      statusText: response.statusText,
    };
  }
}

async function getGuestToken() {
  const config = getClickToCallConfig();

  if (!config.serviceAppToken) {
    throw new Error('Configura service_app_token en js/app.js.');
  }

  setAuthIndicator('Solicitando guest token...', 'loading');
  setClickToCallStatus('Autenticando invitado con Webex...', 'loading');

  const response = await fetch('https://webexapis.com/v1/guests/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.serviceAppToken}`,
    },
    body: JSON.stringify({
      subject: 'Webex Click To Call Demo',
      displayName: config.guestName,
    }),
    redirect: 'follow',
  });

  const data = await parseJsonResponse(response);

  if (!response.ok || !data.accessToken) {
    setAuthIndicator('Error obteniendo guest token', 'error');
    throw new Error(`No se pudo obtener el guest token: ${JSON.stringify(data)}`);
  }

  setAuthIndicator('Guest autenticado', 'ready');
  setClickToCallStatus('Guest token obtenido correctamente.', 'loading');
  return data.accessToken;
}

async function getJweToken() {
  const config = getClickToCallConfig();

  if (!config.serviceAppToken) {
    throw new Error('Configura service_app_token en js/app.js.');
  }

  if (!config.calledNumber) {
    throw new Error('Configura CLICK_TO_CALL_CALLED_NUMBER en js/app.js.');
  }

  setAuthIndicator('Solicitando call token...', 'loading');
  setClickToCallStatus('Generando call token para Click to Call...', 'loading');

  const response = await fetch('https://webexapis.com/v1/telephony/click2call/callToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.serviceAppToken}`,
    },
    body: JSON.stringify({
      calledNumber: config.calledNumber,
      guestName: config.guestName,
    }),
    redirect: 'follow',
  });

  const data = await parseJsonResponse(response);

  if (!response.ok || !data.callToken) {
    setAuthIndicator('Error obteniendo call token', 'error');
    throw new Error(`No se pudo obtener el call token: ${JSON.stringify(data)}`);
  }

  setAuthIndicator('Autenticado', 'ready');
  setClickToCallStatus('Call token obtenido correctamente.', 'loading');
  return data.callToken;
}

async function getWebexConfig() {
  const guestToken = await getGuestToken();

  return {
    config: {
      logger: {
        level: 'debug',
      },
      meetings: {
        reconnection: {
          enabled: true,
        },
        enableRtx: true,
      },
      encryption: {
        kmsInitialTimeout: 8000,
        kmsMaxTimeout: 40000,
        batcherMaxCalls: 30,
        caroots: null,
      },
      dss: {},
    },
    credentials: {
      access_token: guestToken,
    },
  };
}

async function getCallingConfig() {
  const config = getClickToCallConfig();
  const jweToken = await getJweToken();
  const loggerConfig = { level: 'info' };

  return {
    clientConfig: {
      calling: true,
      callHistory: false,
    },
    callingClientConfig: {
      logger: loggerConfig,
      discovery: {
        region: config.region,
        country: config.country,
      },
      serviceData: {
        indicator: 'guestcalling',
        domain: '',
        guestName: config.guestName,
      },
      jwe: jweToken,
    },
    logger: loggerConfig,
  };
}

function openCallNotification() {
  if (callNotification) {
    callNotification.toggle();
  }
}

function openCallWindow() {
  if (callNotification) {
    callNotification.toggle();
  }
}

function closeCallWindow() {
  if (callNotification) {
    callNotification.toggle('close');
  }
}

function updateAvailability() {
  if (profileOnline) {
    profileOnline.classList.add('online');
  }

  setAuthIndicator('Autenticado', 'ready');
  setLineIndicator('Registrada', 'ready');
  setClickToCallButtonReady(true, 'Autenticado y listo para llamar.', 'ready');
}
