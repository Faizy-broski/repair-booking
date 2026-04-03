/**
 * SMS Service — Multi-provider abstraction for sending SMS.
 * Supported providers: Twilio, TextLocal, SMSGlobal.
 * Provider is configured per-business via the businesses table (sms_gateway, sms_api_key, etc.)
 */

export interface SmsConfig {
  gateway: 'twilio' | 'textlocal' | 'smsglobal'
  apiKey: string
  apiSecret?: string | null
  senderId?: string | null
}

export interface SmsPayload {
  to: string        // E.164 phone number
  body: string      // plain text message
}

export interface SmsResult {
  success: boolean
  messageId?: string
  error?: string
}

// ── Provider Interface ────────────────────────────────────────────────────────

interface SmsProvider {
  send(config: SmsConfig, payload: SmsPayload): Promise<SmsResult>
}

// ── Twilio Provider ───────────────────────────────────────────────────────────

const twilioProvider: SmsProvider = {
  async send(config, payload) {
    const accountSid = config.apiKey
    const authToken = config.apiSecret ?? ''
    const from = config.senderId ?? ''

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

    const params = new URLSearchParams({
      To: payload.to,
      From: from,
      Body: payload.body,
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `Twilio error: ${response.status} ${error}` }
    }

    const data = await response.json()
    return { success: true, messageId: data.sid }
  },
}

// ── TextLocal Provider ────────────────────────────────────────────────────────

const textLocalProvider: SmsProvider = {
  async send(config, payload) {
    const url = 'https://api.textlocal.in/send/'
    const params = new URLSearchParams({
      apikey: config.apiKey,
      numbers: payload.to.replace(/^\+/, ''),
      message: payload.body,
      sender: config.senderId ?? 'TXTLCL',
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `TextLocal error: ${response.status} ${error}` }
    }

    const data = await response.json()
    if (data.status === 'failure') {
      return { success: false, error: data.errors?.[0]?.message ?? 'TextLocal failure' }
    }
    return { success: true, messageId: data.batch_id?.toString() }
  },
}

// ── SMSGlobal Provider ────────────────────────────────────────────────────────

const smsGlobalProvider: SmsProvider = {
  async send(config, payload) {
    const url = 'https://api.smsglobal.com/http-api.php'
    const params = new URLSearchParams({
      action: 'sendsms',
      user: config.apiKey,
      password: config.apiSecret ?? '',
      from: config.senderId ?? 'SMSGlobal',
      to: payload.to.replace(/^\+/, ''),
      text: payload.body,
    })

    const response = await fetch(`${url}?${params.toString()}`)

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `SMSGlobal error: ${response.status} ${error}` }
    }

    const text = await response.text()
    if (text.startsWith('OK')) {
      const messageId = text.split(':')[1]?.trim()
      return { success: true, messageId }
    }
    return { success: false, error: `SMSGlobal error: ${text}` }
  },
}

// ── Provider Registry ─────────────────────────────────────────────────────────

const providers: Record<string, SmsProvider> = {
  twilio: twilioProvider,
  textlocal: textLocalProvider,
  smsglobal: smsGlobalProvider,
}

// ── Public SMS Service ────────────────────────────────────────────────────────

export const SmsService = {
  async send(config: SmsConfig, payload: SmsPayload): Promise<SmsResult> {
    const provider = providers[config.gateway]
    if (!provider) {
      return { success: false, error: `Unsupported SMS gateway: ${config.gateway}` }
    }
    return provider.send(config, payload)
  },

  /**
   * Quick test — sends a test message to validate credentials.
   */
  async testConnection(config: SmsConfig, testNumber: string): Promise<SmsResult> {
    return this.send(config, {
      to: testNumber,
      body: 'This is a test message from your POS system. If you received this, your SMS gateway is configured correctly.',
    })
  },
}
