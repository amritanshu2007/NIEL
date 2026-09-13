'use strict';

/**
 * Fast2SMS Provider (SMS via the Fast2SMS bulk V2 API).
 *
 * Fast2SMS is an SMS-only gateway (no WhatsApp endpoint), so sendWhatsApp
 * returns a clear non-OK result rather than silently routing to SMS.
 * Credentials come from the injected config (environment only).
 */

const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

class Fast2SmsAdapter {
  /**
   * @param {object} cfg { apiKey, route, senderId }
   */
  constructor(cfg, timeoutMs = 8000) {
    const { apiKey, route, senderId } = cfg || {};
    this.name = 'fast2sms';
    this.supportedChannels = ['sms'];
    this.apiKey = apiKey || '';
    this.route = route || 'q';
    this.senderId = senderId || '';
    this.timeoutMs = timeoutMs;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async sendSMS(msg) {
    if (!this.configured) {
      return { ok: false, externalId: null, error: 'Fast2SMS is not configured (missing API key)' };
    }
    const form = new URLSearchParams({
      route: this.route,
      message: msg.body,
      language: 'english',
      flash: '0',
      numbers: msg.to,
    });
    if (this.senderId) form.set('sender_id', this.senderId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(FAST2SMS_URL, {
        method: 'POST',
        headers: {
          authorization: this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.return === false) {
        return {
          ok: false,
          externalId: payload.request_id || null,
          error: `Fast2SMS rejected: ${(payload.message || payload.detail || `HTTP ${res.status}`).slice(0, 300)}`,
        };
      }
      return {
        ok: true,
        externalId: payload.request_id || null,
        error: null,
        providerStatus: payload,
      };
    } catch (err) {
      return { ok: false, externalId: null, error: `Fast2SMS request failed: ${err.message.slice(0, 300)}` };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendWhatsApp() {
    return {
      ok: false,
      externalId: null,
      error: 'Fast2SMS does not support WhatsApp - configure another provider for WhatsApp',
    };
  }
}

module.exports = Fast2SmsAdapter;