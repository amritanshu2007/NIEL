'use strict';

/**
 * Twilio Provider (SMS + WhatsApp via the Twilio REST Messages API).
 *
 * Credentials come exclusively from the injected config (which reads env).
 * Never logs them; never exposes them. WhatsApp uses the `whatsapp:` address
 * form of the Messages resource (`whatsapp:+<to>` prefixes applied here).
 */

const twilioEndpoint = (accountSid) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

class TwilioAdapter {
  /**
   * @param {object} cfg { accountSid, authToken, smsFrom, whatsappFrom }
   */
  constructor(cfg, timeoutMs = 8000) {
    const { accountSid, authToken, smsFrom, whatsappFrom } = cfg || {};
    this.name = 'twilio';
    this.supportedChannels = ['sms', 'whatsapp'];
    this.accountSid = accountSid || '';
    this.authToken = authToken || '';
    this.smsFrom = smsFrom || '';
    this.whatsappFrom = whatsappFrom || '';
    this.timeoutMs = timeoutMs;
  }

  get configured() {
    return Boolean(this.accountSid && this.authToken);
  }

  _auth() {
    return 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
  }

  async _post(form) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(twilioEndpoint(this.accountSid), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: this._auth(),
        },
        body: new URLSearchParams(form).toString(),
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          externalId: null,
          error: `Twilio HTTP ${res.status}: ${(payload.message || 'unknown').slice(0, 300)}`,
        };
      }
      return {
        ok: true,
        externalId: payload.sid || null,
        error: null,
        providerStatus: { status: payload.status || null },
      };
    } catch (err) {
      return { ok: false, externalId: null, error: `Twilio request failed: ${err.message.slice(0, 300)}` };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendSMS(msg) {
    if (!this.configured) {
      return { ok: false, externalId: null, error: 'Twilio is not configured (missing account SID / token)' };
    }
    if (!this.smsFrom) {
      return { ok: false, externalId: null, error: 'TWILIO_SMS_FROM is not configured' };
    }
    return this._post({ From: this.smsFrom, To: msg.to, Body: msg.body });
  }

  async sendWhatsApp(msg) {
    if (!this.configured) {
      return { ok: false, externalId: null, error: 'Twilio is not configured (missing account SID / token)' };
    }
    if (!this.whatsappFrom) {
      return { ok: false, externalId: null, error: 'TWILIO_WHATSAPP_FROM is not configured' };
    }
    const wa = (n) => `whatsapp:${n}`;
    return this._post({ From: wa(this.whatsappFrom), To: wa(msg.to), Body: msg.body });
  }
}

module.exports = TwilioAdapter;