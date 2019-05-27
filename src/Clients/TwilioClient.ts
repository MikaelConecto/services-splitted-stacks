class TwilioClient {
  engine: any
  client: any
  private fromNumber: string

  constructor() {
    this.engine = require('twilio')
    this.client = this.engine(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )
    this.fromNumber = process.env.TWILIO_NUMBER
  }

  sendSMS(to: string, message: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.messages
        .create({
          body: message,
          from: this.fromNumber,
          to: to,
        })
        .then(results => {
          resolve(results)
        })
        .catch(error => {
          reject(error)
        })
    })
  }

  registerNotifyServiceUser(cognitoSub: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.notify
        .services(process.env.TWILIO_NOTIFY_SID)
        .bindings.create({
          identity: cognitoSub,
          bindingType: 'fcm',
          address: token,
        })
        .then(results => {
          resolve(results)
        })
        .catch(error => {
          reject(error)
        })
    })
  }

  sendNotification(
    to: string,
    title: string,
    message: string,
    action: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.notify
        .services(process.env.TWILIO_NOTIFY_SID)
        .notifications.create({
          identity: to,
          title: title,
          body: message,
          action: action,
        })
        .then(results => {
          resolve(results)
        })
        .catch(error => {
          reject(error)
        })
    })
  }

  sendCallRedirection(
    callNumber: string,
    redirectToNumber: string,
    message: string,
    language: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const twiml = new this.engine.twiml.VoiceResponse()

      twiml.say(
        {
          voice: 'alice',
          language: language,
        },
        message
      )
      twiml.dial(
        {
          timeout: 20,
        },
        redirectToNumber
      )

      const callUrl = `http://twimlets.com/echo?Twiml=${encodeURIComponent(
        twiml.toString()
      )}`

      this.client.calls.create(
        {
          url: callUrl,
          to: callNumber,
          from: process.env.TWILIO_NUMBER,
        },
        function(error, call) {
          if (error) {
            console.log(error)
            reject(error)
          } else {
            console.log(call.sid)
            resolve(call)
          }
        }
      )
    })
  }
}

export default TwilioClient
