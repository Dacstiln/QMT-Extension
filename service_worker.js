import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, writeBatch, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSE5dF8dMmyizXWfFYyo-xHeCZLuYRtbA",
  authDomain: "qmt-extension.firebaseapp.com",
  projectId: "qmt-extension",
  storageBucket: "qmt-extension.firebasestorage.app",
  messagingSenderId: "825912701716",
  appId: "1:825912701716:web:158d752693bdd2a7f14801"
};


let currentUser = null;
let currentUserData = null;
let userUnsubscribe = null;
let authStateChangeCount = 0;


const SW_START_TIME = Date.now();
function swNow() { return `+${((Date.now() - SW_START_TIME)/1000).toFixed(2)}s`; }
function swLog(fn, msg, data = {}) {
  const ts = new Date().toISOString();
  const uid = currentUser ? currentUser.uid.slice(0,8) : 'NO-USER';
  console.log(`[SW][${swNow()}][${ts}][${fn}] uid=${uid} | ${msg}`, data);
}
function swWarn(fn, msg, data = {}) {
  const ts = new Date().toISOString();
  const uid = currentUser ? currentUser.uid.slice(0,8) : 'NO-USER';
  console.warn(`[SW-WARN][${swNow()}][${ts}][${fn}] uid=${uid} | ${msg}`, data);
}
function swError(fn, msg, data = {}) {
  const ts = new Date().toISOString();
  const uid = currentUser ? currentUser.uid.slice(0,8) : 'NO-USER';
  console.error(`[SW-ERROR][${swNow()}][${ts}][${fn}] uid=${uid} | ${msg}`, data);
}

swLog('SW_INIT', '🟢 Service Worker arrancando — módulo evaluado');

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: indexedDBLocalPersistence
});
const db = getFirestore(app);

// ─── authReady: se crea FRESCA cada vez que el SW despierta ──────────────────
let authReadyResolve;
let authReady = new Promise(resolve => { authReadyResolve = resolve; });
let authInitialized = false;

// ─── lastKnownUser: persistencia de sesión en chrome.storage.local ────────────
// Se guarda cada vez que onAuthStateChanged confirma un usuario real.
// Se limpia SOLO en logout explícito o en null confirmado sin error de red.
const LAST_KNOWN_USER_KEY = 'qmt_last_known_user';
const LAST_KNOWN_USER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

async function saveLastKnownUser(user) {
  try {
    await chrome.storage.local.set({
      [LAST_KNOWN_USER_KEY]: {
        uid: user.uid,
        email: user.email,
        savedAt: Date.now()
      }
    });
    swLog('saveLastKnownUser', `✅ lastKnownUser guardado uid=${user.uid}`);
  } catch (err) {
    swWarn('saveLastKnownUser', `No se pudo guardar lastKnownUser: ${err.message}`);
  }
}

async function clearLastKnownUser() {
  try {
    await chrome.storage.local.remove(LAST_KNOWN_USER_KEY);
    swLog('clearLastKnownUser', '🗑️ lastKnownUser eliminado de storage');
  } catch (err) {
    swWarn('clearLastKnownUser', `No se pudo limpiar lastKnownUser: ${err.message}`);
  }
}

async function getLastKnownUser() {
  try {
    const result = await chrome.storage.local.get(LAST_KNOWN_USER_KEY);
    const entry = result[LAST_KNOWN_USER_KEY];
    if (!entry) return null;
    const age = Date.now() - (entry.savedAt || 0);
    if (age > LAST_KNOWN_USER_MAX_AGE_MS) {
      swWarn('getLastKnownUser', `⏰ lastKnownUser expirado (${Math.round(age/3600000)}h) — ignorando`);
      await clearLastKnownUser();
      return null;
    }
    return entry;
  } catch (err) {
    swWarn('getLastKnownUser', `No se pudo leer lastKnownUser: ${err.message}`);
    return null;
  }
}

swLog('SW_INIT', '⏳ authReady Promise creada. authInitialized=false. Esperando onAuthStateChanged...');

chrome.runtime.onStartup?.addListener(() => {
  swLog('onStartup', '🔄 chrome.runtime.onStartup disparado — SW arrancó desde cero (navegador abierto)');
  swLog('onStartup', `Estado ANTES del reset: authInitialized=${authInitialized}, currentUser=${currentUser ? currentUser.uid : 'null'}`);
  authInitialized = false;
  currentUser = null;
  authReady = new Promise(resolve => { authReadyResolve = resolve; });
  swLog('onStartup', '✅ Estado reseteado. Nueva authReady Promise creada.');
});

// ─── Detección de errores de red en Firebase ─────────────────────────────────
// Firebase no expone el error directamente en onAuthStateChanged(null),
// pero sí en la consola. Usamos una bandera que se activa si detectamos
// auth/network-request-failed en una ventana de tiempo corta.
let _lastAuthErrorWasNetwork = false;
let _lastAuthErrorTime = 0;

// Monkey-patch temporal: escuchar errores globales de Firebase Auth
// Firebase lanza estos como errores en la promesa interna de token refresh.
// No hay API pública, pero podemos capturarlos con unhandledrejection.
self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason && reason.code === 'auth/network-request-failed') {
    _lastAuthErrorWasNetwork = true;
    _lastAuthErrorTime = Date.now();
    swWarn('unhandledrejection', '⚠️ auth/network-request-failed detectado — próximo null de onAuthStateChanged se tratará como transitorio');
  }
});

function wasRecentNetworkError() {
  // Considerar "reciente" si ocurrió en los últimos 5 segundos
  return _lastAuthErrorWasNetwork && (Date.now() - _lastAuthErrorTime < 5000);
}

onAuthStateChanged(auth, async (user) => {
  authStateChangeCount++;
  const changeNum = authStateChangeCount;
  const prevUid = currentUser ? currentUser.uid : 'null';
  const newUid = user ? user.uid : 'null';

  swLog('onAuthStateChanged', `🔔 DISPARO #${changeNum} | prevUser=${prevUid} → newUser=${newUid} | authInitialized=${authInitialized}`);

  if (prevUid !== newUid) {
    if (user) {
      swLog('onAuthStateChanged', `✅ Usuario AUTENTICADO: uid=${user.uid} email=${user.email}`);
    } else {
      swWarn('onAuthStateChanged', `❌ Usuario pasó a NULL — SESIÓN PERDIDA O CERRADA | prevUid=${prevUid} | changeNum=${changeNum}`);
      console.trace('[SW] onAuthStateChanged → user=null STACK TRACE');
    }
  } else {
    swLog('onAuthStateChanged', `ℹ️ Mismo usuario, re-disparo (token refresh o listener duplicado) | uid=${newUid}`);
  }

  currentUser = user;

  // ─── Persistencia de lastKnownUser ────────────────────────────────────────
  if (user) {
    // Usuario real confirmado → guardar siempre
    await saveLastKnownUser(user);
  } else {
    // user=null: solo limpiar si es un logout real confirmado
    // NO limpiar si: el SW acaba de despertar (authInitialized era false)
    //               o si la causa fue un error de red
    const networkError = wasRecentNetworkError();
    const swJustWoke = !authInitialized;

    if (networkError) {
      swWarn('onAuthStateChanged', `⚠️ user=null pero auth/network-request-failed reciente — NO limpiando lastKnownUser (null transitorio por red)`);
    } else if (swJustWoke) {
      swWarn('onAuthStateChanged', `⚠️ user=null en primer disparo del SW recién despertado — NO limpiando lastKnownUser (null transitorio por rehidratación)`);
    } else {
      // authInitialized ya era true Y no es error de red → logout real
      swLog('onAuthStateChanged', `🗑️ user=null confirmado como logout real (authInitialized=${authInitialized}, networkError=${networkError}) — limpiando lastKnownUser`);
      await clearLastKnownUser();
    }
  }

  if (!authInitialized) {
    authInitialized = true;
    swLog('onAuthStateChanged', `🔓 authReady RESUELTA por primera vez | user=${newUid} | changeNum=${changeNum}`);
    authReadyResolve();
  } else {
    swLog('onAuthStateChanged', `ℹ️ authReady ya estaba resuelta. currentUser actualizado a: ${newUid}`);
  }

  if (userUnsubscribe) {
    swLog('onAuthStateChanged', '🗑️ Cancelando listener onSnapshot previo de Firestore (userUnsubscribe)');
    userUnsubscribe();
    userUnsubscribe = null;
  }

  if (user) {
    swLog('onAuthStateChanged', `📡 Registrando onSnapshot para users/${user.uid}`);
    userUnsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      const userData = docSnap.exists() ? docSnap.data() : {};
      swLog('onSnapshot:user', `📥 Snapshot recibido para users/${user.uid} | existe=${docSnap.exists()} | role=${userData.role || 'N/A'}`);
      currentUserData = userData;

      chrome.tabs.query({}, (tabs) => {
        swLog('onSnapshot:user', `📤 Enviando USER_DATA_CHANGED a ${tabs.length} tabs`);
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'USER_DATA_CHANGED',
            user: { uid: user.uid, email: user.email, displayName: user.displayName },
            userData: userData
          }, () => { void chrome.runtime.lastError; });
        });
      });
    }, (err) => {
      swError('onSnapshot:user', `Error en snapshot de users/${user.uid}`, { error: err.message });
    });
  } else {
    currentUserData = null;
    swLog('onAuthStateChanged', 'currentUserData limpiado a null');
  }
});

// ─── getAuthenticatedUser ─────────────────────────────────────────────────────
async function getAuthenticatedUser() {
  const callTs = new Date().toISOString();
  swLog('getAuthenticatedUser', `⏳ Llamada | authInitialized=${authInitialized} | currentUser=${currentUser ? currentUser.uid : 'null'} | auth.currentUser=${auth.currentUser ? auth.currentUser.uid : 'null'}`);

  const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 8000));
  const result = await Promise.race([authReady, timeout]);

  if (result === 'timeout' && !authInitialized) {
    swError('getAuthenticatedUser', `⏰ TIMEOUT de 8s esperando authReady — Firebase no respondió | authInitialized=${authInitialized}`);
    return null;
  }

  const liveUser = auth.currentUser;

  if (liveUser && !currentUser) {
    swWarn('getAuthenticatedUser', `⚠️ DESYNC: auth.currentUser=${liveUser.uid} pero currentUser=null — sincronizando`);
    currentUser = liveUser;
  }

  if (!currentUser && !liveUser) {
    swWarn('getAuthenticatedUser', `❌ RESULTADO: sin usuario autenticado | currentUser=null | auth.currentUser=null | authInitialized=${authInitialized}`);
  } else {
    swLog('getAuthenticatedUser', `✅ RESULTADO: uid=${(currentUser || liveUser).uid} | via=${currentUser ? 'currentUser' : 'auth.currentUser'}`);
  }

  return currentUser || liveUser || null;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function isAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) return false;
  if (currentUserData) return currentUserData.role === 'admin';
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() && snap.data().role === 'admin';
}

async function saveTemplateToFirestore(templateData) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");

  const docRef = doc(db, "templates", templateData.id.toString());
  const existing = await getDoc(docRef);

  const dataToSave = {
    ...templateData,
    ownerId: user.uid,
    name: templateData.name,
    updatedAt: serverTimestamp()
  };

  if (!existing.exists()) {
    dataToSave.createdAt = serverTimestamp();
  } else {
    delete dataToSave.createdAt;
  }

  await setDoc(docRef, dataToSave, { merge: true });
}

async function deleteTemplateFromFirestore(templateId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");
  const docRef = doc(db, "templates", templateId.toString());
  const snap = await getDoc(docRef);
  if (snap.exists() && snap.data().ownerId !== user.uid) {
    throw new Error("Sin permisos para eliminar esta plantilla");
  }
  await deleteDoc(docRef);
}

async function getAllTemplatesFromFirestore() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");

  const q = query(collection(db, "templates"), where("ownerId", "==", user.uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function importTemplatesToFirestore(templates) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");

  const batch = writeBatch(db);
  templates.forEach(t => {
    const docRef = doc(collection(db, "templates"));
    batch.set(docRef, {
      ...t,
      ownerId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
}

async function adminGetAllTemplates() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");
  if (!(await isAdmin())) throw new Error("Sin permisos de administración");

  const templatesSnap = await getDocs(collection(db, "templates"));
  const templates = templatesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const usersSnap = await getDocs(collection(db, "users"));
  const usersMap = {};
  usersSnap.docs.forEach(d => { usersMap[d.id] = d.data(); });

  const grouped = {};
  templates.forEach(t => {
    const uid = t.ownerId || 'sin-propietario';
    if (!grouped[uid]) {
      const u = usersMap[uid] || {};
      grouped[uid] = {
        uid,
        name: u.name || u.email || uid,
        email: u.email || '',
        role: u.role || 'user',
        templates: []
      };
    }
    grouped[uid].templates.push(t);
  });

  return Object.values(grouped);
}

async function adminDeleteTemplate(templateId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");
  if (!(await isAdmin())) throw new Error("Sin permisos de administración");
  await deleteDoc(doc(db, "templates", templateId.toString()));
}

async function adminUpdateTemplate(templateId, templateData) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");
  if (!(await isAdmin())) throw new Error("Sin permisos de administración");
  await setDoc(doc(db, "templates", templateId.toString()), {
    ...templateData,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function adminAssignTemplate(templateData, targetUserIds) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");
  if (!(await isAdmin())) throw new Error("Sin permisos de administración");

  let userIds = targetUserIds;
  const isGlobalAssign = !userIds || userIds.length === 0;

  if (isGlobalAssign) {
    const usersSnap = await getDocs(collection(db, "users"));
    userIds = usersSnap.docs.map(d => d.id);
  }

  const batch = writeBatch(db);
  userIds.forEach(uid => {
    const docRef = doc(collection(db, "templates"));
    batch.set(docRef, {
      ...templateData,
      id: docRef.id,
      ownerId: uid,
      assignedByAdmin: true,
      isGlobal: isGlobalAssign,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
}

async function adminGetAllUsers() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");
  if (!(await isAdmin())) throw new Error("Sin permisos de administración");
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

async function adminSetUserRole(uid, role) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No autenticado");
  if (!(await isAdmin())) throw new Error("Sin permisos de administración");
  await setDoc(doc(db, "users", uid), { role }, { merge: true });
}

// ─── Message handler ─────────────────────────────────────────────────────────

let messageCount = 0;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  messageCount++;
  const msgNum = messageCount;
  const ts = new Date().toISOString();
  swLog('onMessage', `📨 MSG #${msgNum} tipo=${request.type} | sender=${sender.tab ? `tab#${sender.tab.id}` : 'extension'} | authInitialized=${authInitialized} | currentUser=${currentUser ? currentUser.uid.slice(0,8) : 'null'}`);

  if (request.type === 'GET_AUTH_STATE') {
    swLog('GET_AUTH_STATE', `📨 #${msgNum} → iniciando getAuthenticatedUser()`);
    getAuthenticatedUser().then(async (user) => {
      if (user) {
        const resp = { user: { uid: user.uid, email: user.email } };
        swLog('GET_AUTH_STATE', `📤 #${msgNum} → respondiendo: user=${user.uid}`);
        sendResponse(resp);
      } else {
        // user=null: antes de responder, verificar si hay lastKnownUser reciente
        const lastKnown = await getLastKnownUser();
        if (lastKnown) {
          swWarn('GET_AUTH_STATE', `⚠️ #${msgNum} → getAuthenticatedUser()=null pero hay lastKnownUser uid=${lastKnown.uid} — respondiendo stale:true`);
          sendResponse({ user: { uid: lastKnown.uid, email: lastKnown.email }, stale: true });
        } else {
          swWarn('GET_AUTH_STATE', `❌ #${msgNum} → RESPONDIENDO NULL confirmado (sin lastKnownUser) | authInitialized=${authInitialized}`);
          sendResponse({ user: null });
        }
      }
    });
    return true;

  } else if (request.type === 'GET_USER_ROLE') {
    getAuthenticatedUser().then(user => {
      if (user) {
        getDoc(doc(db, "users", user.uid))
          .then(snap => {
            const role = snap.exists() ? (snap.data().role || 'user') : 'user';
            swLog('GET_USER_ROLE', `📤 #${msgNum} → role=${role} uid=${user.uid}`);
            sendResponse({ role });
          })
          .catch(err => {
            swError('GET_USER_ROLE', `Error obteniendo role`, { error: err.message });
            sendResponse({ role: 'user' });
          });
      } else {
        swWarn('GET_USER_ROLE', `#${msgNum} → sin usuario autenticado, role=null`);
        sendResponse({ role: null });
      }
    });
    return true;

  } else if (request.type === 'LOGIN') {
    swLog('LOGIN', `📨 #${msgNum} → intento de login email=${request.email}`);
    signInWithEmailAndPassword(auth, request.email, request.password)
      .then(() => {
        swLog('LOGIN', `✅ #${msgNum} → login exitoso email=${request.email}`);
        sendResponse({ success: true });
      })
      .catch(err => {
        swError('LOGIN', `#${msgNum} → login fallido: ${err.message}`);
        sendResponse({ success: false, error: err.message });
      });
    return true;

  } else if (request.type === 'LOGOUT') {
    swLog('LOGOUT', `📨 #${msgNum} → LOGOUT solicitado | uid=${currentUser ? currentUser.uid : 'null'}`);
    console.trace('[SW] LOGOUT STACK TRACE — quién lo pidió:');
    // Logout explícito: limpiar lastKnownUser inmediatamente, antes del signOut
    clearLastKnownUser();
    signOut(auth)
      .then(() => {
        swLog('LOGOUT', `✅ #${msgNum} → signOut exitoso`);
        sendResponse({ success: true });
      })
      .catch(err => {
        swError('LOGOUT', `#${msgNum} → signOut fallido: ${err.message}`);
        sendResponse({ success: false, error: err.message });
      });
    return true;

  } else if (request.type === 'GET_USER_DATA') {
    getAuthenticatedUser().then(user => {
      if (user) {
        getDoc(doc(db, "users", user.uid))
          .then(snap => {
            const userData = snap.exists() ? snap.data() : {};
            swLog('GET_USER_DATA', `📤 #${msgNum} → userData obtenido uid=${user.uid}`);
            sendResponse({ user: { uid: user.uid, email: user.email }, userData });
          })
          .catch(err => {
            swError('GET_USER_DATA', `#${msgNum} → error Firestore`, { error: err.message });
            sendResponse({ error: err.message });
          });
      } else {
        swWarn('GET_USER_DATA', `#${msgNum} → sin usuario, respondiendo null`);
        sendResponse({ user: null });
      }
    });
    return true;

  } else if (request.type === 'GET_TEMPLATES') {
    swLog('GET_TEMPLATES', `📨 #${msgNum} → iniciando | authInitialized=${authInitialized} | currentUser=${currentUser ? currentUser.uid.slice(0,8) : 'null'}`);
    getAuthenticatedUser().then(user => {
      if (!user) {
        swWarn('GET_TEMPLATES', `❌ #${msgNum} → NO AUTENTICADO — respondiendo error | authInitialized=${authInitialized}`);
        sendResponse({ success: false, error: 'No autenticado' });
        return;
      }
      swLog('GET_TEMPLATES', `🔍 #${msgNum} → consultando Firestore para uid=${user.uid}`);
      const q = query(collection(db, "templates"), where("ownerId", "==", user.uid));
      getDocs(q)
        .then(snap => {
          const templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          swLog('GET_TEMPLATES', `📤 #${msgNum} → respondiendo ${templates.length} templates para uid=${user.uid}`);
          if (templates.length === 0) {
            swWarn('GET_TEMPLATES', `⚠️ #${msgNum} → Firestore devolvió ARRAY VACÍO para uid=${user.uid} — ¿es esperado?`);
          }
          sendResponse({ success: true, templates });
        })
        .catch(err => {
          swError('GET_TEMPLATES', `#${msgNum} → error Firestore`, { error: err.message });
          sendResponse({ success: false, error: err.message });
        });
    });
    return true;

  } else if (request.type === 'SIGNUP') {
    createUserWithEmailAndPassword(auth, request.email, request.password)
      .then(async (cred) => {
        try {
          await setDoc(doc(db, "users", cred.user.uid), request.userData);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'UPDATE_USER_DATA') {
    const { uid, userData } = request;
    setDoc(doc(db, "users", uid), userData, { merge: true })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'SAVE_TEMPLATE') {
    swLog('SAVE_TEMPLATE', `📨 #${msgNum} → templateId=${request.template?.id}`);
    saveTemplateToFirestore(request.template)
      .then(() => {
        swLog('SAVE_TEMPLATE', `✅ #${msgNum} → guardado exitoso`);
        sendResponse({ success: true });
      })
      .catch(err => {
        swError('SAVE_TEMPLATE', `#${msgNum} → error: ${err.message}`);
        sendResponse({ success: false, error: err.message });
      });
    return true;

  } else if (request.type === 'DELETE_TEMPLATE') {
    deleteTemplateFromFirestore(request.templateId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'GET_ALL_USER_TEMPLATES') {
    getAllTemplatesFromFirestore()
      .then(templates => sendResponse({ success: true, templates }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'IMPORT_TEMPLATES_TO_FIREBASE') {
    importTemplatesToFirestore(request.templates)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'ADMIN_GET_ALL_TEMPLATES') {
    adminGetAllTemplates()
      .then(grouped => sendResponse({ success: true, grouped }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'ADMIN_DELETE_TEMPLATE') {
    adminDeleteTemplate(request.templateId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'ADMIN_UPDATE_TEMPLATE') {
    adminUpdateTemplate(request.templateId, request.templateData)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'ADMIN_ASSIGN_TEMPLATE') {
    adminAssignTemplate(request.templateData, request.targetUserIds)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'ADMIN_GET_ALL_USERS') {
    adminGetAllUsers()
      .then(users => sendResponse({ success: true, users }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;

  } else if (request.type === 'ADMIN_SET_USER_ROLE') {
    adminSetUserRole(request.uid, request.role)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  swWarn('onMessage', `⚠️ Tipo de mensaje no manejado: ${request.type}`);
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  swLog('onInstalled', '🔧 onInstalled disparado');
});