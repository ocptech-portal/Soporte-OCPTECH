let calling;
let callingClient;
let line;
let call;
let incomingCall;
let localAudioStream;
let lineRegistered = false;

async function initCalling(userType) {
  try {
    setClickToCallButtonReady(false, 'Validando configuracion...', 'loading');
    validateClickToCallConfig();

    if (typeof Calling === 'undefined') {
      throw new Error('No se encontro el SDK Calling. Revisa que calling.min.js cargue correctamente.');
    }

    const webexConfig = await getWebexConfig(userType);
    const callingConfig = await getCallingConfig();

    setClickToCallStatus('Inicializando SDK de Webex Calling...', 'loading');
    calling = await Calling.init({ webexConfig, callingConfig });

    if (!calling || typeof calling.on !== 'function') {
      throw new Error('Calling.init no devolvio una instancia valida.');
    }

    setClickToCallStatus('SDK inicializado. Esperando evento ready...', 'loading');
    calling.on('ready', handleCallingReady);

    window.setTimeout(() => {
      const button = document.getElementById('clickToCallBtn');
      if (!lineRegistered && button && button.disabled) {
        setClickToCallStatus('Aun esperando registro de linea. Revisa la consola si este estado no cambia.', 'loading');
      }
    }, 15000);
  } catch (error) {
    console.error('No se pudo inicializar Webex Calling:', error);
    setAuthIndicator('Error', 'error');
    setLineIndicator('No registrada', 'error');
    setClickToCallStatus(`Error de inicializacion: ${error.message}`, 'error');
    setClickToCallButtonReady(false);
    throw error;
  }
}

async function handleCallingReady() {
  try {
    setAuthIndicator('SDK listo', 'ready');
    setLineIndicator('Registrando...', 'loading');
    setClickToCallStatus('SDK listo. Registrando Webex Calling...', 'loading');

    await calling.register();

    callingClient = window.callingClient = calling.callingClient;

    const lines = callingClient && typeof callingClient.getLines === 'function'
      ? Object.values(callingClient.getLines())
      : [];

    line = lines[0];

    if (!line) {
      throw new Error('No se encontro una linea disponible para registrar.');
    }

    setupLineListeners();

    const registrationResult = line.register();

    if (registrationResult && typeof registrationResult.then === 'function') {
      const registeredLine = await registrationResult;
      if (registeredLine) line = registeredLine;
      lineRegistered = true;
      updateAvailability();
    } else {
      setClickToCallStatus('Registro de linea iniciado. Esperando confirmacion...', 'loading');
    }
  } catch (error) {
    console.error('No se pudo registrar Webex Calling:', error);
    setLineIndicator('Error de registro', 'error');
    setClickToCallStatus(`No se pudo registrar Webex Calling: ${error.message}`, 'error');
    setClickToCallButtonReady(false);
  }
}

function setupLineListeners() {
  if (!line || typeof line.on !== 'function') return;

  line.on('registered', (lineInfo) => {
    if (lineInfo) line = lineInfo;
    lineRegistered = true;
    updateAvailability();
  });

  line.on('line:incoming_call', (callObj) => {
    incomingCall = callObj;
    openCallNotification(callObj);
  });

  line.on('error', (error) => {
    console.error('Error en la linea Webex Calling:', error);
    setLineIndicator('Error', 'error');
    setClickToCallStatus('Error en la linea Webex Calling. Revisa la consola.', 'error');
    setClickToCallButtonReady(false);
  });
}

async function getMediaStreams() {
  localAudioStream = await Calling.createMicrophoneStream({ audio: true });

  const localAudioElem = document.getElementById('local-audio');
  if (localAudioElem) {
    localAudioElem.srcObject = localAudioStream.outputStream;
  }

  return localAudioStream;
}

function bindOutboundCallEvents(number) {
  if (!call || typeof call.on !== 'function') return;

  call.on('connect', () => {
    if (typeof callNotification !== 'undefined' && callNotification) {
      callNotification.startTimer();
    }
    setClickToCallStatus('Llamada conectada.', 'ready');
  });

  call.on('progress', () => {
    setClickToCallStatus('Llamada en progreso...', 'loading');
  });

  call.on('remote_media', (track) => {
    const remoteAudioElem = document.getElementById('customer-remote-audio');
    if (remoteAudioElem) {
      remoteAudioElem.srcObject = new MediaStream([track]);
    }
  });

  call.on('disconnect', () => {
    closeCallWindow();
    setClickToCallButtonReady(true, 'Llamada finalizada. Listo para llamar nuevamente.', 'ready');
    call = undefined;
  });

  call.on('error', (error) => {
    console.error('Error en la llamada:', error);
    closeCallWindow();
    setClickToCallButtonReady(true, 'Error en la llamada. Puedes intentar nuevamente.', 'error');
    call = undefined;
  });
}

async function initiateCall(number) {
  try {
    if (!lineRegistered || !line || typeof line.makeCall !== 'function') {
      throw new Error('Webex Calling aun no esta listo.');
    }

    setClickToCallButtonReady(false, 'Iniciando llamada...', 'loading');
    await getMediaStreams();
    openCallWindow(number);

    if (number) {
      call = line.makeCall({
        type: 'uri',
        address: number,
      });
    } else {
      call = line.makeCall();
    }

    bindOutboundCallEvents(number);
    call.dial(localAudioStream);
  } catch (error) {
    console.error('No se pudo iniciar la llamada:', error);
    closeCallWindow();
    setClickToCallButtonReady(lineRegistered, `No se pudo iniciar la llamada: ${error.message}`, 'error');
  }
}

function disconnectCall() {
  const activeCall = call || incomingCall;

  try {
    if (activeCall && typeof activeCall.end === 'function') {
      activeCall.end();
    }
  } catch (error) {
    console.error('No se pudo finalizar la llamada:', error);
  } finally {
    closeCallWindow();
    setClickToCallButtonReady(lineRegistered, 'Llamada finalizada.', lineRegistered ? 'ready' : 'loading');
    call = undefined;
    incomingCall = undefined;
  }
}

function toggleMute() {
  const activeCall = call || incomingCall;
  if (!activeCall || typeof activeCall.mute !== 'function') return;

  try {
    activeCall.mute(localAudioStream);
  } catch (error) {
    console.error('No se pudo cambiar el estado de mute:', error);
  }
}
