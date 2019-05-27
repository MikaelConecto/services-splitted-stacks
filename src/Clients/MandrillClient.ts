import mandrill from 'mandrill-api/mandrill'
import { format } from 'date-fns'

import MandrillSendTemplateData from '../Interfaces/MandrillSendTemplateData'

class MandrillClient {
  private engine: any

  constructor() {
    this.engine = new mandrill.Mandrill(process.env.MANDRILL_API_KEY)
  }

  sendEmailWithTemplate(
    mailData: MandrillSendTemplateData,
    options: any = []
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const sendAt = !('sendAt' in mailData)
        ? format(Date.now(), 'YYYY-MM-DD HH:mm:ss')
        : mailData.sendAt
      const message = {
        subject: mailData.subject,
        from_email: process.env.MANDRILL_FROM_EMAIL,
        from_name: process.env.MANDRILL_FROM_NAME,
        to: [
          {
            email: mailData.to,
            name: mailData.name,
            type: 'to',
          },
        ],
        merge: true,
        merge_language: 'handlebars',
        ...options,
        merge_vars: [
          {
            rcpt: mailData.to,
            vars: options.merge_vars || [],
          },
        ],
      }

      this.engine.messages.sendTemplate(
        {
          template_name: mailData.templateName,
          template_content: mailData.templateContent,
          message: message,
          async: mailData.async,
          send_at: sendAt,
        },
        result => {
          resolve(result)
        },
        error => {
          reject(error)
        }
      )
    })
  }
}

export default MandrillClient
