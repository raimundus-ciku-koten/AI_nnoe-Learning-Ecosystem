const {
  HttpError,
  fail,
  requireMethod,
  requireSameOrigin,
} = require('./_lib/common.js');

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    requireSameOrigin(req);
    throw new HttpError(
      410,
      'AI cloud dinonaktifkan. Gunakan AI_nnoe lokal pada perangkat ini.',
      'cloud_ai_disabled',
    );
  } catch (error) {
    fail(res, error);
  }
};
