'use strict';

const CONTROL_PATH = 'platform/controlState';
const PUBLIC_PATH = 'publicConfig/platform';
const FEATURES = Object.freeze(['aiAssistant', 'aiGeneration']);
const DEFAULT_STATE = Object.freeze({
  maintenance: false,
  features: Object.freeze({ aiAssistant: true, aiGeneration: true }),
});

class PlatformControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlatformControlError';
    this.code = code;
  }
}

function parseControlRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PlatformControlError('invalid-argument', 'Format pengaturan platform tidak valid.');
  }

  const keys = Object.keys(data).sort();
  if (data.setting === 'maintenance' && keys.join(',') === 'enabled,setting' &&
      typeof data.enabled === 'boolean') {
    return { setting: 'maintenance', enabled: data.enabled };
  }

  if (data.setting === 'feature' && keys.join(',') === 'enabled,feature,setting' &&
      FEATURES.includes(data.feature) && typeof data.enabled === 'boolean') {
    return { setting: 'feature', feature: data.feature, enabled: data.enabled };
  }

  throw new PlatformControlError('invalid-argument', 'Pengaturan platform tidak dikenal atau nilainya tidak valid.');
}

function stateFromDocument(data = {}) {
  const featureValues = data.features && typeof data.features === 'object' ? data.features : {};
  return {
    maintenance: data.maintenance === true,
    features: Object.fromEntries(FEATURES.map((feature) => [
      feature,
      typeof featureValues[feature] === 'boolean' ? featureValues[feature] : DEFAULT_STATE.features[feature],
    ])),
  };
}

function createPlatformControlService({ db, fieldValue, randomUUID }) {
  if (!db || !fieldValue || typeof randomUUID !== 'function') {
    throw new TypeError('Firestore, FieldValue, dan randomUUID wajib tersedia.');
  }

  async function setControl(actorUid, requestData) {
    if (typeof actorUid !== 'string' || !actorUid.trim()) {
      throw new PlatformControlError('unauthenticated', 'Sesi superadmin tidak valid.');
    }
    const request = parseControlRequest(requestData);
    const controlRef = db.doc(CONTROL_PATH);
    const publicRef = db.doc(PUBLIC_PATH);
    const auditRef = db.doc(`platformAudit/${randomUUID()}`);
    let result;

    await db.runTransaction(async (transaction) => {
      const [snapshot, publicSnapshot] = await Promise.all([
        transaction.get(controlRef),
        transaction.get(publicRef),
      ]);
      const before = stateFromDocument(snapshot.exists ? snapshot.data() : {});
      const published = stateFromDocument(publicSnapshot.exists ? publicSnapshot.data() : {});
      const after = {
        maintenance: before.maintenance,
        features: { ...before.features },
      };
      const target = request.setting === 'maintenance' ? 'maintenance' : `features.${request.feature}`;

      if (request.setting === 'maintenance') after.maintenance = request.enabled;
      else after.features[request.feature] = request.enabled;

      if (request.setting === 'maintenance' && before.maintenance === after.maintenance ||
          request.setting === 'feature' && before.features[request.feature] === after.features[request.feature]) {
        if (!publicSnapshot.exists || JSON.stringify(published) !== JSON.stringify(before)) {
          transaction.set(publicRef, {
            ...before,
            updatedAt: fieldValue.serverTimestamp(),
          });
        }
        result = { changed: false, state: after };
        return;
      }

      transaction.set(controlRef, {
        ...after,
        updatedAt: fieldValue.serverTimestamp(),
        updatedBy: actorUid,
      });
      transaction.set(publicRef, {
        ...after,
        updatedAt: fieldValue.serverTimestamp(),
      });
      transaction.create(auditRef, {
        actorUid,
        action: 'platform.control.updated',
        target,
        before: request.setting === 'maintenance' ? before.maintenance : before.features[request.feature],
        after: request.enabled,
        createdAt: fieldValue.serverTimestamp(),
      });
      result = { changed: true, state: after };
    });

    return result;
  }

  async function isFeatureEnabled(feature) {
    if (!FEATURES.includes(feature)) {
      throw new PlatformControlError('invalid-argument', 'Fitur platform tidak dikenal.');
    }
    const snapshot = await db.doc(CONTROL_PATH).get();
    return stateFromDocument(snapshot.exists ? snapshot.data() : {}).features[feature];
  }

  async function isMaintenanceEnabled() {
    const snapshot = await db.doc(CONTROL_PATH).get();
    return stateFromDocument(snapshot.exists ? snapshot.data() : {}).maintenance;
  }

  return { setControl, isFeatureEnabled, isMaintenanceEnabled };
}

module.exports = {
  CONTROL_PATH,
  PUBLIC_PATH,
  FEATURES,
  DEFAULT_STATE,
  PlatformControlError,
  parseControlRequest,
  stateFromDocument,
  createPlatformControlService,
};
